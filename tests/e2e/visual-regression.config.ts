import { defineConfig, devices } from '@playwright/test';

export interface VisualViewport {
  name: string;
  width: number;
  height: number;
}

export const VIEWPORTS: VisualViewport[] = [
  { name: 'mobile', width: 375, height: 667 },
  { name: 'desktop', width: 1440, height: 900 },
];

export const PAGES: string[] = ['/'];

export const threshold = 0.2;

export default defineConfig({});
