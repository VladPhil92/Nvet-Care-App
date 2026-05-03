/**
 * Detox runtime configuration — Nvet Care mobile.
 *
 * Devices objetivo:
 *   - iPhone 15 simulator (iOS 17.5+)
 *   - Pixel 6 API 33 emulator (Android 13)
 *
 * Builds:
 *   - ios.sim.debug   → npm run e2e:build:ios
 *   - android.emu.debug → npm run e2e:build:android
 *
 * Test runner: jest-circus con timeout 120s.
 *
 * Variables de entorno opcionales:
 *   - DETOX_RECORD_VIDEOS=1   → grabación de video automática en CI
 *   - DETOX_TAKE_SCREENSHOTS=manual → screenshot manual en steps clave
 *   - DETOX_REUSE=1           → no reinstala app en cada test (más rápido en local)
 */

/** @type {Detox.DetoxConfig} */
module.exports = {
  testRunner: {
    args: {
      $0: 'jest',
      config: 'e2e/jest.config.js',
    },
    jest: {
      setupTimeout: 120_000,
    },
  },
  apps: {
    'ios.debug': {
      type: 'ios.app',
      binaryPath:
        'ios/build/Build/Products/Debug-iphonesimulator/NvetCare.app',
      build:
        "xcodebuild -workspace ios/NvetCare.xcworkspace -scheme NvetCare -configuration Debug -sdk iphonesimulator -derivedDataPath ios/build -quiet",
    },
    'ios.release': {
      type: 'ios.app',
      binaryPath:
        'ios/build/Build/Products/Release-iphonesimulator/NvetCare.app',
      build:
        "xcodebuild -workspace ios/NvetCare.xcworkspace -scheme NvetCare -configuration Release -sdk iphonesimulator -derivedDataPath ios/build -quiet",
    },
    'android.debug': {
      type: 'android.apk',
      binaryPath: 'android/app/build/outputs/apk/debug/app-debug.apk',
      testBinaryPath:
        'android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk',
      build:
        'cd android && ./gradlew assembleDebug assembleAndroidTest -DtestBuildType=debug',
      reversePorts: [3000, 8081],
    },
    'android.release': {
      type: 'android.apk',
      binaryPath: 'android/app/build/outputs/apk/release/app-release.apk',
      testBinaryPath:
        'android/app/build/outputs/apk/androidTest/release/app-release-androidTest.apk',
      build:
        'cd android && ./gradlew assembleRelease assembleAndroidTest -DtestBuildType=release',
    },
  },
  devices: {
    simulator: {
      type: 'ios.simulator',
      device: {
        type: 'iPhone 15',
      },
    },
    emulator: {
      type: 'android.emulator',
      device: {
        avdName: 'Pixel_6_API_33',
      },
    },
  },
  configurations: {
    'ios.sim.debug': {
      device: 'simulator',
      app: 'ios.debug',
    },
    'ios.sim.release': {
      device: 'simulator',
      app: 'ios.release',
    },
    'android.emu.debug': {
      device: 'emulator',
      app: 'android.debug',
    },
    'android.emu.release': {
      device: 'emulator',
      app: 'android.release',
    },
  },
  artifacts: {
    rootDir: '.detox-artifacts',
    plugins: {
      log: { enabled: true },
      uiHierarchy: 'enabled',
      screenshot: {
        shouldTakeAutomaticSnapshots: process.env.CI === 'true',
        keepOnlyFailedTestsArtifacts: true,
        takeWhen: {
          testStart: false,
          testDone: true,
        },
      },
      video: {
        enabled: process.env.DETOX_RECORD_VIDEOS === '1',
        keepOnlyFailedTestsArtifacts: true,
      },
    },
  },
  behavior: {
    init: {
      reinstallApp: process.env.DETOX_REUSE !== '1',
      exposeGlobals: true,
    },
    cleanup: {
      shutdownDevice: false,
    },
  },
  logger: {
    level: process.env.CI === 'true' ? 'info' : 'warn',
  },
}
