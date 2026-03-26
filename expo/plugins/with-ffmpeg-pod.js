const {
  withPlugins,
  createRunOncePlugin,
  withDangerousMod,
} = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

function fixPodfile(podfilePath) {
  const shaqPod = `pod 'shaquillehinds-ffmpeg-kit-ios', :podspec => 'https://raw.githubusercontent.com/shaquillehinds/ffmpeg/master/shaquillehinds-ffmpeg-kit-ios.podspec'`;

  let contents = fs.readFileSync(podfilePath, "utf8");
  if (!contents.includes("shaquillehinds-ffmpeg-kit-ios")) {
    contents = contents.replace(
      /post_install do \|installer\|/g,
      `${shaqPod}\n\n  post_install do |installer|`
    );
    fs.writeFileSync(podfilePath, contents, "utf8");
  }
}

function fixPodspec(projectRoot) {
  const podspecPath = path.join(
    projectRoot,
    "node_modules",
    "ffmpeg-kit-react-native",
    "ffmpeg-kit-react-native.podspec"
  );

  if (!fs.existsSync(podspecPath)) return;

  const newPodspec = `require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = package["name"]
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = "https://github.com/shaquillehinds/ffmpeg"
  s.license      = package["license"]
  s.authors      = package["author"]
  s.platform          = :ios
  s.requires_arc      = true
  s.static_framework  = true
  s.source       = { :git => "https://github.com/arthenica/ffmpeg-kit.git", :tag => "react.native.v#{s.version}" }
  s.default_subspec = 'min'
  s.dependency "React-Core"

  s.subspec 'min' do |ss|
    ss.source_files      = '**/FFmpegKitReactNativeModule.m', '**/FFmpegKitReactNativeModule.h'
    ss.dependency 'shaquillehinds-ffmpeg-kit-ios', "6.0.2"
    ss.ios.deployment_target = '12.1'
  end

  s.subspec 'https' do |ss|
    ss.source_files      = '**/FFmpegKitReactNativeModule.m', '**/FFmpegKitReactNativeModule.h'
    ss.dependency 'shaquillehinds-ffmpeg-kit-ios', "6.0.2"
    ss.ios.deployment_target = '12.1'
  end
end`;

  fs.writeFileSync(podspecPath, newPodspec, "utf8");
  console.log("FFmpeg podspec overridden with shaquillehinds fork");
}

function withMyFFmpegPod(config) {
  return withDangerousMod(config, [
    "ios",
    (cfg) => {
      const podfilePath = path.join(
        cfg.modRequest.platformProjectRoot,
        "Podfile"
      );
      fixPodfile(podfilePath);
      fixPodspec(cfg.modRequest.projectRoot);
      return cfg;
    },
  ]);
}

const withFFmpegPod = (config) => {
  return withPlugins(config, [withMyFFmpegPod]);
};

module.exports = createRunOncePlugin(
  withFFmpegPod,
  "with-ffmpeg-pod",
  "1.0.0"
);
