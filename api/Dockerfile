# `docker compose up`용 API 이미지. 로컬 개발은 루트의 `npm run dev`를 사용한다.
FROM eclipse-temurin:21-jdk AS build
WORKDIR /app
# 의존성 레이어를 소스와 분리해 소스만 바뀌면 다운로드를 다시 하지 않는다.
COPY gradlew settings.gradle build.gradle ./
COPY gradle gradle
RUN ./gradlew --no-daemon dependencies > /dev/null
COPY src src
RUN ./gradlew --no-daemon bootJar -x test && cp build/libs/*[!n].jar app.jar

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /app/app.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
