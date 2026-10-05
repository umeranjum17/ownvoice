plugins {
    id("com.android.application")
}

android {
    namespace = "dev.ownvoice.probe"
    compileSdk = 35

    defaultConfig {
        applicationId = "dev.ownvoice.probe"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
}

repositories {
    google()
    mavenCentral()
}
