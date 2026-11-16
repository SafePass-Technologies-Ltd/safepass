import java.io.FileInputStream
import java.util.Properties
import org.gradle.api.GradleException

plugins {
    id("com.android.application")
    // START: FlutterFire Configuration
    id("com.google.gms.google-services")
    // END: FlutterFire Configuration
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

// Built-in Kotlin compiler options — required when android.builtInKotlin=true
// Replaces the deprecated kotlin-android plugin + kotlinOptions block.
kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

android {
    namespace = "com.safepasstech.safepass_mobile"
    // Pin to an explicit integer rather than the flutter token.
    // flutter_local_notifications requires compileSdk >= 35 (v22.x).
    // Bumped to 36 — several plugins and AndroidX dependencies require compileSdk >= 36.
    compileSdk = 36
    ndkVersion = flutter.ndkVersion

    compileOptions {
        // flutter_local_notifications v10+ requires desugaring so that
        // java.time APIs work on Android API levels below 26.
        isCoreLibraryDesugaringEnabled = true
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        // TODO: Specify your own unique Application ID (https://developer.android.com/studio/build/application-id.html).
        applicationId = "com.safepasstech.safepass_mobile"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    // ---------------------------------------------------------------------
    // Release signing
    // ---------------------------------------------------------------------
    // The upload key is read from android/key.properties, which is gitignored
    // (android/.gitignore) and is never committed. It exists in one of two
    // ways:
    //   * locally, created by hand from the Play Console upload certificate;
    //   * in CI, written by the "Configure Android release signing" step of
    //     .github/workflows/release-android.yml, which decodes the base64
    //     keystore secret to android/upload-keystore.jks and writes this file
    //     with an ABSOLUTE storeFile path.
    // rootProject.file() is used for storeFile because relative values (the
    // usual local convention) resolve against android/, while the CI-written
    // absolute path passes through untouched.
    val keystorePropertiesFile = rootProject.file("key.properties")
    val keystoreProperties = Properties()
    val hasReleaseKeystore = keystorePropertiesFile.exists()
    if (hasReleaseKeystore) {
        // .use{} so the stream is closed even if the file is malformed -- on
        // Windows an unclosed handle keeps key.properties locked.
        FileInputStream(keystorePropertiesFile).use { keystoreProperties.load(it) }
    }

    signingConfigs {
        // Only declare the release config when the file is actually there --
        // an unconditional create() with null values would fail configuration
        // for every debug build on a machine without the upload key.
        if (hasReleaseKeystore) {
            create("release") {
                keyAlias = keystoreProperties.getProperty("keyAlias")
                keyPassword = keystoreProperties.getProperty("keyPassword")
                storeFile = rootProject.file(keystoreProperties.getProperty("storeFile"))
                storePassword = keystoreProperties.getProperty("storePassword")
            }
        }
    }

    buildTypes {
        release {
            if (hasReleaseKeystore) {
                signingConfig = signingConfigs.getByName("release")
            } else {
                // LOCAL-ONLY fallback: with no upload key present, sign the
                // release variant with the debug key so `flutter run --release`
                // and local profiling still work. Such an artifact can never be
                // published -- Play rejects a debug certificate, and a debug
                // key is not a recoverable upload identity.
                //
                // CI takes the hard-failure branch below instead: release
                // workflows export REQUIRE_RELEASE_SIGNING=true for any
                // non-build-only destination, turning a missing keystore into a
                // red build rather than a silently debug-signed bundle.
                if (System.getenv("REQUIRE_RELEASE_SIGNING") == "true") {
                    throw GradleException(
                        "REQUIRE_RELEASE_SIGNING=true but ${keystorePropertiesFile.absolutePath} " +
                            "does not exist. Refusing to build a debug-signed release artifact for " +
                            "a store upload. Ensure the ANDROID_KEYSTORE_BASE64, " +
                            "ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS and ANDROID_KEY_PASSWORD " +
                            "secrets are set and that the 'Configure Android release signing' step " +
                            "in .github/workflows/release-android.yml ran.",
                    )
                }
                signingConfig = signingConfigs.getByName("debug")
            }
        }
    }
}

dependencies {
    // Required for flutter_local_notifications desugaring support (v10+).
    // Provides java.time backport for Android API levels below 26.
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.4")
}

flutter {
    source = "../.."
}

