import {
  combinePresetAndAppleSplashScreens,
  defineConfig,
  minimal2023Preset,
} from "@vite-pwa/assets-generator/config";

export default defineConfig({
  images: ["public/icon-512.png"],
  preset: combinePresetAndAppleSplashScreens(minimal2023Preset, {
    name: (landscape, size) =>
      `apple-splash-${landscape ? "landscape" : "portrait"}-${size.width}x${size.height}.png`,
  }),
});
