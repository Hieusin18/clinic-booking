// Pipeline CI/CD của hệ thống đặt lịch khám (chạy trên Jenkins trong ci/docker-compose.yml).
//
// Luồng: lấy code → cài thư viện → test (+ độ phủ) → SonarQube → Quality Gate
//        → build image → [đẩy Docker Hub] → [deploy laptop] → [deploy VPS qua SSH]
//
// Các bước trong [ ] chỉ chạy khi bật bằng biến môi trường toàn cục của Jenkins
// (Manage Jenkins → System → Global properties → Environment variables):
//   PUSH_IMAGES=true   cần credential 'dockerhub' + biến DOCKERHUB_NAMESPACE (tên tài khoản Docker Hub)
//   DEPLOY_LOCAL=true  cần credential 'clinic-env' (Secret file = nội dung file .env)
//   DEPLOY_VPS=true    cần 'vps-ssh' (SSH key user deploy), 'vps-host' (IP), 'clinic-env-prod' (.env của VPS)
pipeline {
  agent any

  options {
    timestamps()
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '20'))
    timeout(time: 60, unit: 'MINUTES')
  }

  // Jenkins chạy trên laptop nên GitHub không gọi vào được: cứ 2 phút tự hỏi GitHub có commit mới không
  triggers {
    pollSCM('H/2 * * * *')
  }

  environment {
    TAG = "${env.BUILD_NUMBER}"
    IMAGE_PREFIX = "${env.DOCKERHUB_NAMESPACE ? env.DOCKERHUB_NAMESPACE + '/clinic' : 'clinic'}"
    // Mạng Docker của máy CI (project "clinic-ci"); CSDL test được gắn vào đây để Jenkins gọi tới
    CI_NETWORK = 'clinic-ci_default'
    TEST_DB = "clinic-test-db-${env.BUILD_NUMBER}"
  }

  stages {
    stage('Checkout') {
      steps {
        checkout scm
        sh 'git log -1 --format="%h %s (%an)"'
      }
    }

    stage('Cài thư viện') {
      parallel {
        stage('backend') { steps { dir('backend') { sh 'npm ci --no-audit --no-fund' } } }
        stage('web')     { steps { dir('web')     { sh 'npm ci --no-audit --no-fund' } } }
        stage('mobile')  { steps { dir('mobile')  { sh 'npm ci --no-audit --no-fund' } } }
      }
    }

    stage('Test') {
      parallel {
        stage('Backend: migration, build, test') {
          steps {
            // PostgreSQL riêng cho lần build này, xoá ngay khi xong
            sh '''
              docker run -d --name "$TEST_DB" --network "$CI_NETWORK" \
                -e POSTGRES_USER=clinic -e POSTGRES_PASSWORD=clinic -e POSTGRES_DB=clinic_test \
                postgres:16-alpine
              for i in $(seq 1 60); do
                docker exec "$TEST_DB" pg_isready -h 127.0.0.1 -U clinic -d clinic_test && break
                sleep 2
              done
            '''
            dir('backend') {
              withEnv(["DATABASE_URL=postgresql://clinic:clinic@${env.TEST_DB}:5432/clinic_test"]) {
                sh '''
                  npx prisma validate
                  npx prisma generate
                  npx prisma migrate deploy
                  npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
                  npm run typecheck
                  npm run build
                  npx vitest run --coverage
                '''
              }
            }
          }
          post {
            always { sh 'docker rm -f "$TEST_DB" || true' }
          }
        }
        stage('Web: lint, build, test') {
          steps {
            dir('web') {
              sh '''
                npm run lint
                npm run build
                npx vitest run --coverage
              '''
            }
          }
        }
        stage('Mobile: typecheck, test') {
          steps {
            dir('mobile') {
              sh '''
                npm run typecheck
                npx vitest run --coverage
              '''
            }
          }
        }
      }
    }

    stage('SonarQube') {
      steps {
        script {
          def scannerHome = tool 'sonar-scanner'
          withSonarQubeEnv('sonarqube') {
            sh "${scannerHome}/bin/sonar-scanner -Dsonar.projectVersion=${env.BUILD_NUMBER}"
          }
        }
      }
    }

    stage('Quality Gate') {
      steps {
        // SonarQube chấm xong sẽ gọi webhook về Jenkins; không đạt thì dừng, không deploy
        timeout(time: 10, unit: 'MINUTES') {
          waitForQualityGate abortPipeline: true
        }
      }
    }

    stage('Build image') {
      steps {
        sh '''
          docker build -t "$IMAGE_PREFIX-backend:$TAG" -t "$IMAGE_PREFIX-backend:latest" backend
          docker build --target build -t "$IMAGE_PREFIX-backend-tools:$TAG" -t "$IMAGE_PREFIX-backend-tools:latest" backend
          docker build -f web/Dockerfile -t "$IMAGE_PREFIX-web:$TAG" -t "$IMAGE_PREFIX-web:latest" .
          docker image ls "$IMAGE_PREFIX-*"
        '''
      }
    }

    stage('Push Docker Hub') {
      when { environment name: 'PUSH_IMAGES', value: 'true' }
      steps {
        withCredentials([usernamePassword(credentialsId: 'dockerhub', usernameVariable: 'DH_USER', passwordVariable: 'DH_TOKEN')]) {
          sh '''
            echo "$DH_TOKEN" | docker login -u "$DH_USER" --password-stdin
            for img in backend backend-tools web; do
              docker push "$IMAGE_PREFIX-$img:$TAG"
              docker push "$IMAGE_PREFIX-$img:latest"
            done
          '''
        }
      }
    }

    stage('Deploy laptop') {
      when { environment name: 'DEPLOY_LOCAL', value: 'true' }
      steps {
        withCredentials([file(credentialsId: 'clinic-env', variable: 'APP_ENV')]) {
          sh '''
            docker compose -f docker-compose.prod.yml --env-file "$APP_ENV" up -d --remove-orphans
            for i in $(seq 1 30); do
              curl -fsS http://host.docker.internal/api/health && exit 0
              sleep 3
            done
            echo "Health check thất bại" && docker compose -f docker-compose.prod.yml --env-file "$APP_ENV" logs backend --tail 50
            exit 1
          '''
        }
      }
    }

    stage('Deploy VPS qua SSH') {
      when {
        allOf {
          environment name: 'DEPLOY_VPS', value: 'true'
          environment name: 'PUSH_IMAGES', value: 'true'
        }
      }
      steps {
        withCredentials([string(credentialsId: 'vps-host', variable: 'VPS_HOST'),
                         file(credentialsId: 'clinic-env-prod', variable: 'PROD_ENV')]) {
          sshagent(['vps-ssh']) {
            sh '''
              SSH="ssh -o StrictHostKeyChecking=accept-new deploy@$VPS_HOST"
              $SSH "mkdir -p ~/clinic"
              scp -o StrictHostKeyChecking=accept-new docker-compose.prod.yml "deploy@$VPS_HOST:clinic/docker-compose.yml"
              scp -o StrictHostKeyChecking=accept-new "$PROD_ENV" "deploy@$VPS_HOST:clinic/.env"
              $SSH "cd ~/clinic && export TAG=$TAG IMAGE_PREFIX=$IMAGE_PREFIX && docker compose pull && docker compose up -d --remove-orphans && docker image prune -f"
              for i in $(seq 1 30); do
                curl -fsS "http://$VPS_HOST/api/health" && exit 0
                sleep 3
              done
              echo "Health check VPS thất bại" && exit 1
            '''
          }
        }
      }
    }
  }

  post {
    always {
      sh 'docker rm -f "$TEST_DB" 2>/dev/null || true'
    }
    success {
      echo "Build #${env.BUILD_NUMBER} thành công: image tag ${env.TAG}"
    }
    failure {
      echo "Build #${env.BUILD_NUMBER} thất bại, xem stage màu đỏ để biết lỗi"
    }
  }
}
