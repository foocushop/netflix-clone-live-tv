plugins {
  alias(libs.plugins.android.application)
}

android {
    namespace = "com.example.netflixlivetv"
    compileSdk = 36
    defaultConfig {
        applicationId = "com.example.netflixlivetv"
        minSdk = 21
        targetSdk = 34
        versionCode = 2
        versionName = "1.1"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }

    packaging {
      resources {
        excludes += "/META-INF/{AL2.0,LGPL2.1}"
      }
    }
}

dependencies {
}
