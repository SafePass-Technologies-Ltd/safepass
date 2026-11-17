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
        applicationId = "com.safepasstech.safepass_mobile"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName

        // -----------------------------------------------------------------
        // Google Maps API key
        // -----------------------------------------------------------------
        // Resolved from local.properties (gitignored, local dev) or the
        // GOOGLE_MAPS_ANDROID_API_KEY Gradle property (CI, fed from a GitHub
        // secret). It is deliberately NOT committed in AndroidManifest.xml:
        // a key in the manifest is compiled into the AAB and becomes public
        // the moment the app is published, so anyone could bill requests to
        // it. Resolution order:
        //   1. local.properties  -> android/local.properties (developer machine)
        //   2. -PGOOGLE_MAPS_ANDROID_API_KEY / ORG_GRADLE_PROJECT_... (CI)
        // An empty value leaves Maps without a key, which fails visibly at
        // runtime rather than silently shipping a shared credential.
        val localPropertiesFile = rootProject.file("local.properties")
        val localProperties = Properties()
        if (localPropertiesFile.exists()) {
            FileInputStream(localPropertiesFile).use { localProperties.load(it) }
        }
        val googleMapsApiKey: String =
            localProperties.getProperty("GOOGLE_MAPS_ANDROID_API_KEY")
                ?: (project.findProperty("GOOGLE_MAPS_ANDROID_API_KEY") as String?)
                ?: ""
        manifestPlaceholders["googleMapsApiKey"] = googleMapsApiKey

        // CI dead-man switch, sharing REQUIRE_RELEASE_SIGNING (set by the
        // release workflows for every non-build-only destination): a store
        // build with no Maps key installs fine and then shows a blank map,
        // which is not a recoverable experience for a journey-monitoring app.
        if (System.getenv("REQUIRE_RELEASE_SIGNING") == "true" && googleMapsApiKey.isBlank()) {
            throw GradleException(
                "GOOGLE_MAPS_ANDROID_API_KEY is empty. Set it in android/local.properties " +
                    "for a local release build, or as the GOOGLE_MAPS_ANDROID_API_KEY secret " +
                    "(exported to ORG_GRADLE_PROJECT_GOOGLE_MAPS_ANDROID_API_KEY) in CI.",
            )
        }
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

        // A key.properties that exists but is incomplete (a renamed key, a value
        // pasted into the wrong line, a half-finished copy out of the Play
        // Console) would otherwise fail much later and much less clearly: Gradle
        // reports a null store file or an "invalid keystore" at sign time, and
        // the same gap in CI surfaces only once the AAB reaches Play. Fail at
        // configuration instead, naming every missing property and the file.
        val requiredKeystoreProperties =
            listOf("storeFile", "storePassword", "keyAlias", "keyPassword")
        val missingKeystoreProperties =
            requiredKeystoreProperties.filter { keystoreProperties.getProperty(it).isNullOrBlank() }
        if (missingKeystoreProperties.isNotEmpty()) {
            throw GradleException(
                "${keystorePropertiesFile.absolutePath} is missing " +
                    "${missingKeystoreProperties.joinToString(", ")}. A release keystore needs all " +
                    "four properties: storeFile, storePassword, keyAlias, keyPassword.",
            )
        }
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

