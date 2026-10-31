plugins {
    id("com.android.application")
}

val releaseKeystorePath = System.getenv("BIU_KEYSTORE_PATH")
val releaseKeystoreFile = releaseKeystorePath?.takeIf { it.isNotBlank() }?.let { file(it) }
val hasReleaseKeystore = releaseKeystoreFile?.exists() == true

android {
    namespace = "com.unsunsk8er.biu"
    compileSdk = 34
    buildToolsVersion = "34.0.0"

    defaultConfig {
        applicationId = "com.unsunsk8er.biu"
        minSdk = 26
        targetSdk = 34
        versionCode = 140
        versionName = "2.0.0"
    }

    signingConfigs {
        if (hasReleaseKeystore) {
            create("release") {
                storeFile = releaseKeystoreFile
                storePassword = System.getenv("BIU_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("BIU_KEY_ALIAS")
                keyPassword = System.getenv("BIU_KEY_PASSWORD")
                // 与旧版 APK 一致，同时产出 v2/v3 签名，兼容部分 Android 兼容层。
                enableV3Signing = true
            }
        }
    }

    buildTypes {
        debug {
            isMinifyEnabled = false
        }
        release {
            if (hasReleaseKeystore) {
                signingConfig = signingConfigs.getByName("release")
            } else {
                logger.warn("BIU_KEYSTORE_PATH 未设置，release APK 将保持未签名")
            }
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
