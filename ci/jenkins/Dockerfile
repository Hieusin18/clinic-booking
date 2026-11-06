# Jenkins dùng cho môn Triển khai phần mềm: có sẵn Docker CLI (build image, docker compose),
# Node.js 22 (chạy npm ci / test / build) và các plugin pipeline cần thiết.
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
 && rm -rf /var/lib/apt/lists/*

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
