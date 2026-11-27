FROM maven:3.9.6-eclipse-temurin-21 AS build
WORKDIR /build
COPY pom.xml .
RUN mvn -B -ntp -q dependency:go-offline
COPY src ./src
RUN mvn -B -ntp -q package -DskipTests

FROM eclipse-temurin:21-jre
WORKDIR /app
RUN useradd --system --uid 10001 --home-dir /app appuser
COPY --from=build /build/target/*.jar /app/app.jar
RUN java -Djarmode=tools -jar /app/app.jar extract --destination /app/extracted && rm /app/app.jar
WORKDIR /app/extracted
# CDS (Class Data Sharing): pornim o dată contextul Spring la build (fără bază de date: pool-ul se
# conectează abia la prima cerere) și salvăm clasele încărcate. Pornirea pe Render free devine mult mai rapidă.
RUN JWT_SECRET=cds-training-only-cds-training-only-0123456789 \
    java -XX:ArchiveClassesAtExit=app.jsa -XX:+UseSerialGC -XX:TieredStopAtLevel=1 \
         -Dspring.context.exit=onRefresh -jar app.jar \
    || echo "Antrenarea CDS a eșuat; serviciul pornește fără arhivă."
RUN chown -R appuser /app
USER appuser
EXPOSE 8080
ENTRYPOINT ["java", "-XX:SharedArchiveFile=app.jsa", "-XX:+UseSerialGC", "-XX:TieredStopAtLevel=1", "-XX:MaxRAMPercentage=70", "-Xss512k", "-jar", "app.jar"]
