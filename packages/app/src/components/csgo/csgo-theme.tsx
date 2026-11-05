'use client';

import { CsgoDecorations, CsgoThemeBanner } from './csgo-decorations';
import './csgo-theme.css';

export default function CsgoTheme() {
  return (
    <>
      <CsgoDecorations />
      <CsgoThemeBanner />
    </>
  );
}
