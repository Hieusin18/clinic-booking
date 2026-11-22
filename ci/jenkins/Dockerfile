# Jenkins dùng cho môn Triển khai phần mềm: có sẵn Docker CLI (build image, docker compose),
# JDK 21 của image gốc (backend Spring Boot build bằng Maven Wrapper ./mvnw, không cần cài Maven),
# Node.js 22 (npm ci / test / build cho web và mobile) và các plugin pipeline cần thiết.
FROM jenkins/jenkins:lts-jdk21

USER root
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl gnupg openssh-client \
 # Docker CLI + compose plugin (dùng Docker của máy chủ qua /var/run/docker.sock)
 && install -m 0755 -d /etc/apt/keyrings \
 && curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc \
 && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian $(. /etc/os-release && echo $VERSION_CODENAME) stable" > /etc/apt/sources.list.d/docker.list \
 # Node.js 22
 && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
 && apt-get install -y --no-install-recommends docker-ce-cli docker-compose-plugin nodejs \
 && rm -rf /var/lib/apt/lists/* \
 # kubectl + k3d cho bước Deploy Kubernetes (k8s/deploy.sh)
 && curl -fsSL -o /usr/local/bin/kubectl "https://dl.k8s.io/release/v1.30.4/bin/linux/$(dpkg --print-architecture)/kubectl" \
 && curl -fsSL -o /usr/local/bin/k3d "https://github.com/k3d-io/k3d/releases/download/v5.7.4/k3d-linux-$(dpkg --print-architecture)" \
 && chmod +x /usr/local/bin/kubectl /usr/local/bin/k3d

USER jenkins
# Plugin cài sẵn, khỏi bấm tay trong giao diện
RUN jenkins-plugin-cli --plugins \
    workflow-aggregator \
    git \
    github \
    docker-workflow \
    sonar \
    ssh-agent \
    credentials-binding \
    pipeline-stage-view \
    timestamper \
    ws-cleanup \
    configuration-as-code
