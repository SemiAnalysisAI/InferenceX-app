import { ArrowRight, ChevronRight } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { MinecraftSplash } from '@/components/minecraft/minecraft-splash';
import { NewBadge } from '@/components/ui/new-badge';
import {
  agentxDashboardHref,
  FEATURED_AGENTX_MODELS,
  isNewAgentxModel,
} from '@/lib/compare/compare-agentx';

import { CompareIndexTrackedLink } from './compare-index-tracked-link';
import { getDashboardRoute } from '@/lib/routing/dashboard-routes';

const MODEL_LOGOS: Record<string, string> = {
  'muse-spark-open': '/logos/meta-color.svg',
  'kimi-k31-pro': '/logos/kimi-color.svg',
  'kimi-k3': '/logos/kimi-color.svg',
  'deepseek-v41-flash': '/logos/deepseek-color.svg',
  'deepseek-v4': '/logos/deepseek-color.svg',
  'glm-5-3': '/logos/zai-color.svg',
  'minimax-m3': '/logos/minimax-color.svg',
  'minimax-m31-flash': '/logos/minimax-color.svg',
  'qwen-3-8-flash-next': '/logos/qwen-color.svg',
  'qwen-3-5': '/logos/qwen-color.svg',
};

interface VendorMarkGradient {
  id: string;
  x1: string;
  y1: string;
  x2: string;
  y2: string;
  stops: readonly { offset: string; color: string }[];
}

const VENDOR_MARKS: readonly {
  name: string;
  viewBox: string;
  width: number;
  height: number;
  gradients?: readonly VendorMarkGradient[];
  paths: readonly { d: string; fill: string }[];
}[] = [
  {
    name: 'Huawei',
    viewBox: '0 0 24 24',
    width: 24,
    height: 24,
    // Huawei brand mark from https://cdn.simpleicons.org/huawei (Simple Icons).
    paths: [
      {
        d: 'M3.67 6.14S1.82 7.91 1.72 9.78v.35c.08 1.51 1.22 2.4 1.22 2.4 1.83 1.79 6.26 4.04 7.3 4.55 0 0 .06.03.1-.01l.02-.04v-.04C7.52 10.8 3.67 6.14 3.67 6.14zM9.65 18.6c-.02-.08-.1-.08-.1-.08l-7.38.26c.8 1.43 2.15 2.53 3.56 2.2.96-.25 3.16-1.78 3.88-2.3.06-.05.04-.09.04-.09zm.08-.78C6.49 15.63.21 12.28.21 12.28c-.15.46-.2.9-.21 1.3v.07c0 1.07.4 1.82.4 1.82.8 1.69 2.34 2.2 2.34 2.2.7.3 1.4.31 1.4.31.12.02 4.4 0 5.54 0 .05 0 .08-.05.08-.05v-.06c0-.03-.03-.05-.03-.05zM9.06 3.19a3.42 3.42 0 00-2.57 3.15v.41c.03.6.16 1.05.16 1.05.66 2.9 3.86 7.65 4.55 8.65.05.05.1.03.1.03a.1.1 0 00.06-.1c1.06-10.6-1.11-13.42-1.11-13.42-.32.02-1.19.23-1.19.23zm8.299 2.27s-.49-1.8-2.44-2.28c0 0-.57-.14-1.17-.22 0 0-2.18 2.81-1.12 13.43.01.07.06.08.06.08.07.03.1-.03.1-.03.72-1.03 3.9-5.76 4.55-8.64 0 0 .36-1.4.02-2.34zm-2.92 13.07s-.07 0-.09.05c0 0-.01.07.03.1.7.51 2.85 2 3.88 2.3 0 0 .16.05.43.06h.14c.69-.02 1.9-.37 3-2.26l-7.4-.25zm7.83-8.41c.14-2.06-1.94-3.97-1.94-3.98 0 0-3.85 4.66-6.67 10.8 0 0-.03.08.02.13l.04.01h.06c1.06-.53 5.46-2.77 7.28-4.54 0 0 1.15-.93 1.21-2.42zm1.52 2.14s-6.28 3.37-9.52 5.55c0 0-.05.04-.03.11 0 0 .03.06.07.06 1.16 0 5.56 0 5.67-.02 0 0 .57-.02 1.27-.29 0 0 1.56-.5 2.37-2.27 0 0 .73-1.45.17-3.14z',
        fill: '#FF0000',
      },
    ],
  },
  {
    name: 'Google',
    viewBox: '0 0 48 48',
    width: 22,
    height: 22,
    paths: [
      {
        d: 'M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z',
        fill: '#EA4335',
      },
      {
        d: 'M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z',
        fill: '#4285F4',
      },
      {
        d: 'M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z',
        fill: '#FBBC05',
      },
      {
        d: 'M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z',
        fill: '#34A853',
      },
    ],
  },
  {
    name: 'Amazon',
    viewBox: '0 0 603 182',
    width: 66,
    height: 20,
    // Amazon wordmark from https://commons.wikimedia.org/wiki/File:Amazon_logo.svg.
    paths: [
      {
        d: 'm 374.00642,142.18404 c -34.99948,25.79739 -85.72909,39.56123 -129.40634,39.56123 -61.24255,0 -116.37656,-22.65135 -158.08757,-60.32496 -3.2771,-2.96252 -0.34083,-6.9999 3.59171,-4.69283 45.01431,26.19064 100.67269,41.94697 158.16623,41.94697 38.774689,0 81.4295,-8.02237 120.6499,-24.67006 5.92501,-2.51683 10.87999,3.88009 5.08607,8.17965',
        fill: '#FF9900',
      },
      {
        d: 'm 388.55678,125.53635 c -4.45688,-5.71527 -29.57261,-2.70033 -40.84585,-1.36327 -3.43442,0.41947 -3.95874,-2.56925 -0.86517,-4.71905 20.00346,-14.07844 52.82696,-10.01483 56.65462,-5.2958 3.82764,4.74526 -0.99624,37.64741 -19.79373,53.35128 -2.88385,2.41195 -5.63662,1.12734 -4.35198,-2.07113 4.2209,-10.53917 13.68519,-34.16054 9.20211,-39.90203',
        fill: '#FF9900',
      },
      {
        d: 'M 348.49744,20.06598 V 6.38079 c 0,-2.07113 1.57301,-3.46062 3.46062,-3.46062 h 61.26875 c 1.96628,0 3.53929,1.41571 3.53929,3.46062 v 11.71893 c -0.0262,1.96626 -1.67788,4.53551 -4.61418,8.59912 l -31.74859,45.32893 c 11.79759,-0.28837 24.25059,1.46814 34.94706,7.49802 2.41195,1.36327 3.06737,3.35575 3.25089,5.32203 V 99.4506 c 0,1.99248 -2.20222,4.32576 -4.5093,3.1198 -18.84992,-9.88376 -43.887,-10.95865 -64.72939,0.10487 -2.12356,1.15354 -4.35199,-1.15354 -4.35199,-3.14602 V 85.66054 c 0,-2.22843 0.0262,-6.02989 2.25463,-9.41186 l 36.78224,-52.74829 h -32.01076 c -1.96626,0 -3.53927,-1.38948 -3.53927,-3.43441',
        fill: 'currentColor',
      },
      {
        d: 'm 124.99883,105.45424 h -18.64017 c -1.78273,-0.13107 -3.19845,-1.46813 -3.32954,-3.17224 V 6.61676 c 0,-1.91383 1.59923,-3.43442 3.59171,-3.43442 h 17.38176 c 1.80898,0.0786 3.25089,1.46814 3.38199,3.19845 v 12.50545 h 0.34082 c 4.53551,-12.08598 13.05597,-17.7226 24.53896,-17.7226 11.66649,0 18.95477,5.63662 24.19814,17.7226 4.5093,-12.08598 14.76008,-17.7226 25.74495,-17.7226 7.81262,0 16.35931,3.22467 21.57646,10.46052 5.89879,8.04857 4.69281,19.74128 4.69281,29.99208 l -0.0262,60.37739 c 0,1.91383 -1.59923,3.46061 -3.59171,3.46061 h -18.61397 c -1.86138,-0.13107 -3.35574,-1.62543 -3.35574,-3.46061 V 51.29025 c 0,-4.03739 0.36702,-14.10466 -0.52434,-17.93233 -1.38949,-6.42311 -5.55797,-8.23209 -10.95865,-8.23209 -4.5093,0 -9.22833,3.01494 -11.14216,7.83885 -1.91383,4.8239 -1.73031,12.89867 -1.73031,18.32557 v 50.70338 c 0,1.91383 -1.59923,3.46061 -3.59171,3.46061 h -18.61395 c -1.88761,-0.13107 -3.35576,-1.62543 -3.35576,-3.46061 L 152.946,51.29025 c 0,-10.67025 1.75651,-26.37415 -11.48298,-26.37415 -13.39682,0 -12.87248,15.31063 -12.87248,26.37415 v 50.70338 c 0,1.91383 -1.59923,3.46061 -3.59171,3.46061',
        fill: 'currentColor',
      },
      {
        d: 'm 469.51439,1.16364 c 27.65877,0 42.62858,23.75246 42.62858,53.95427 0,29.17934 -16.54284,52.32881 -42.62858,52.32881 -27.16066,0 -41.94697,-23.75246 -41.94697,-53.35127 0,-29.78234 14.96983,-52.93181 41.94697,-52.93181 m 0.15729,19.53156 c -13.73761,0 -14.60278,18.71881 -14.60278,30.38532 0,11.69271 -0.18352,36.65114 14.44549,36.65114 14.44548,0 15.12712,-20.13452 15.12712,-32.40403 0,-8.07477 -0.34082,-17.72257 -2.779,-25.3779 -2.09735,-6.65906 -6.26581,-9.25453 -12.19083,-9.25453',
        fill: 'currentColor',
      },
      {
        d: 'M 548.00762,105.45424 H 529.4461 c -1.86141,-0.13107 -3.35577,-1.62543 -3.35577,-3.46061 l -0.0262,-95.69149 c 0.1573,-1.75653 1.7041,-3.1198 3.59171,-3.1198 h 17.27691 c 1.62543,0.0786 2.96249,1.17976 3.32954,2.67412 v 14.62899 h 0.3408 c 5.21717,-13.0822 12.53165,-19.32181 25.40412,-19.32181 8.36317,0 16.51662,3.01494 21.75999,11.27324 4.87633,7.65532 4.87633,20.5278 4.87633,29.78233 v 60.22011 c -0.20973,1.67786 -1.75653,3.01492 -3.59169,3.01492 h -18.69262 c -1.70411,-0.13107 -3.11982,-1.38948 -3.30332,-3.01492 V 50.47753 c 0,-10.46052 1.20597,-25.77117 -11.66651,-25.77117 -4.5355,0 -8.70399,3.04117 -10.77512,7.65532 -2.62167,5.84637 -2.96249,11.66651 -2.96249,18.11585 v 51.5161 c -0.0262,1.91383 -1.65166,3.46061 -3.64414,3.46061',
        fill: 'currentColor',
      },
      {
        d: 'M 55.288261,59.75829 V 55.7209 c -13.475471,0 -27.711211,2.88385 -27.711211,18.77125 0,8.04857 4.16847,13.50169 11.32567,13.50169 5.24337,0 9.93618,-3.22467 12.8987,-8.46805 3.670341,-6.44935 3.486841,-12.50544 3.486841,-19.7675 m 18.79747,45.43378 c -1.23219,1.10111 -3.01495,1.17976 -4.40444,0.4457 -6.18716,-5.1385 -7.28828,-7.52423 -10.69647,-12.42678 -10.224571,10.4343 -17.460401,13.55409 -30.726141,13.55409 -15.67768,0 -27.89471,-9.67401 -27.89471,-29.04824 0,-15.12713 8.20587,-25.43035 19.87236,-30.46398 10.1197,-4.45688 24.25058,-5.24337 35.051931,-6.47556 v -2.41195 c 0,-4.43066 0.34082,-9.67403 -2.25465,-13.50167 -2.280881,-3.43442 -6.632861,-4.85013 -10.460531,-4.85013 -7.10475,0 -13.44924,3.64414 -14.99603,11.19459 -0.31461,1.67789 -1.5468,3.32955 -3.22467,3.4082 L 6.26276,32.67628 C 4.74218,32.33548 3.0643,31.10327 3.48377,28.76999 7.65225,6.85271 27.44596,0.24605 45.16856,0.24605 c 9.071011,0 20.921021,2.41195 28.078221,9.28076 9.07104,8.46804 8.20587,19.7675 8.20587,32.06321 v 29.04826 c 0,8.73022 3.61794,12.55786 7.02613,17.27691 1.20597,1.67786 1.46814,3.69656 -0.05244,4.95497 -3.80144,3.17225 -10.56538,9.07104 -14.28819,12.37436 l -0.05242,-0.0525',
        fill: 'currentColor',
      },
      {
        d: 'M 299.65545 59.75829 V 55.7209 c -13.47547 0 -27.71121 2.88385 -27.71121 18.77125 0 8.04857 4.16847 13.50169 11.32567 13.50169 5.24337 0 9.93618 -3.22467 12.8987 -8.46805 3.67034 -6.44935 3.48684 -12.50544 3.48684 -19.7675 m 18.79747 45.43378 c -1.23219 1.10111 -3.01495 1.17976 -4.40444 0.4457 -6.18716 -5.1385 -7.28828 -7.52423 -10.69647 -12.42678 -10.22457 10.4343 -17.4604 13.55409 -30.72614 13.55409 -15.67768 0 -27.89471 -9.67401 -27.89471 -29.04824 0 -15.12713 8.20587 -25.43035 19.87236 -30.46398 10.1197 -4.45688 24.25058 -5.24337 35.05193 -6.47556 v -2.41195 c 0 -4.43066 0.34082 -9.67403 -2.25465 -13.50167 -2.28088 -3.43442 -6.63286 -4.85013 -10.46053 -4.85013 -7.10475 0 -13.44924 3.64414 -14.99603 11.19459 -0.31461 1.67789 -1.5468 3.32955 -3.22467 3.4082 L 250.62995 32.67628 C 249.10937 32.33548 247.43149 31.10327 247.85096 28.76999 252.01944 6.85271 271.81315 0.24605 289.53575 0.24605 c 9.07101 0 20.92102 2.41195 28.07822 9.28076 9.07104 8.46804 8.20587 19.7675 8.20587 32.06321 v 29.04826 c 0 8.73022 3.61794 12.55786 7.02613 17.27691 1.20597 1.67786 1.46814 3.69656 -0.05244 4.95497 -3.80144 3.17225 -10.56538 9.07104 -14.28819 12.37436 l -0.05242 -0.0525',
        fill: 'currentColor',
      },
    ],
  },
  {
    name: 'OpenAI',
    viewBox: '0 0 256 260',
    width: 22,
    height: 22,
    paths: [
      {
        d: 'M239.184 106.203a64.716 64.716 0 0 0-5.576-53.103C219.452 28.459 191 15.784 163.213 21.74A65.586 65.586 0 0 0 52.096 45.22a64.716 64.716 0 0 0-43.23 31.36c-14.31 24.602-11.061 55.634 8.033 76.74a64.665 64.665 0 0 0 5.525 53.102c14.174 24.65 42.644 37.324 70.446 31.36a64.72 64.72 0 0 0 48.754 21.744c28.481.025 53.714-18.361 62.414-45.481a64.767 64.767 0 0 0 43.229-31.36c14.137-24.558 10.875-55.423-8.083-76.483Zm-97.56 136.338a48.397 48.397 0 0 1-31.105-11.255l1.535-.87 51.67-29.825a8.595 8.595 0 0 0 4.247-7.367v-72.85l21.845 12.636c.218.111.37.32.409.563v60.367c-.056 26.818-21.783 48.545-48.601 48.601Zm-104.466-44.61a48.345 48.345 0 0 1-5.781-32.589l1.534.921 51.722 29.826a8.339 8.339 0 0 0 8.441 0l63.181-36.425v25.221a.87.87 0 0 1-.358.665l-52.335 30.184c-23.257 13.398-52.97 5.431-66.404-17.803ZM23.549 85.38a48.499 48.499 0 0 1 25.58-21.333v61.39a8.288 8.288 0 0 0 4.195 7.316l62.874 36.272-21.845 12.636a.819.819 0 0 1-.767 0L41.353 151.53c-23.211-13.454-31.171-43.144-17.804-66.405v.256Zm179.466 41.695-63.08-36.63L161.73 77.86a.819.819 0 0 1 .768 0l52.233 30.184a48.6 48.6 0 0 1-7.316 87.635v-61.391a8.544 8.544 0 0 0-4.4-7.213Zm21.742-32.69-1.535-.922-51.619-30.081a8.39 8.39 0 0 0-8.492 0L99.98 99.808V74.587a.716.716 0 0 1 .307-.665l52.233-30.133a48.652 48.652 0 0 1 72.236 50.391v.205ZM88.061 139.097l-21.845-12.585a.87.87 0 0 1-.41-.614V65.685a48.652 48.652 0 0 1 79.757-37.346l-1.535.87-51.67 29.825a8.595 8.595 0 0 0-4.246 7.367l-.051 72.697Zm11.868-25.58 28.138-16.217 28.188 16.218v32.434l-28.086 16.218-28.188-16.218-.052-32.434Z',
        fill: 'currentColor',
      },
    ],
  },
  {
    name: 'AMD',
    viewBox: '18.2 9.06 5.88 5.88',
    width: 22,
    height: 22,
    paths: [
      {
        d: 'M18.324 9.137l1.559 1.56h2.556v2.557L24 14.814V9.137zM19.881 11.01l-1.604 1.603v2.25h2.246l1.604-1.607h-2.246z',
        fill: 'currentColor',
      },
    ],
  },
  {
    name: 'NVIDIA',
    viewBox: '-0.02 4.03 24.04 15.94',
    width: 33,
    height: 22,
    paths: [
      {
        d: 'M8.948 8.798v-1.43a6.7 6.7 0 0 1 .424-.018c3.922-.124 6.493 3.374 6.493 3.374s-2.774 3.851-5.75 3.851c-.398 0-.787-.062-1.158-.185v-4.346c1.528.185 1.837.857 2.747 2.385l2.04-1.714s-1.492-1.952-4-1.952a6.016 6.016 0 0 0-.796.035m0-4.735v2.138l.424-.027c5.45-.185 9.01 4.47 9.01 4.47s-4.08 4.964-8.33 4.964c-.37 0-.733-.035-1.095-.097v1.325c.3.035.61.062.91.062 3.957 0 6.82-2.023 9.593-4.408.459.371 2.34 1.263 2.73 1.652-2.633 2.208-8.772 3.984-12.253 3.984-.335 0-.653-.018-.971-.053v1.864H24V4.063zm0 10.326v1.131c-3.657-.654-4.673-4.46-4.673-4.46s1.758-1.944 4.673-2.262v1.237H8.94c-1.528-.186-2.73 1.245-2.73 1.245s.68 2.412 2.739 3.11M2.456 10.9s2.164-3.197 6.5-3.533V6.201C4.153 6.59 0 10.653 0 10.653s2.35 6.802 8.948 7.42v-1.237c-4.84-.6-6.492-5.936-6.492-5.936z',
        fill: '#76B900',
      },
    ],
  },
  {
    name: 'SambaNova',
    viewBox: '0 0 24 21.71',
    width: 24,
    height: 22,
    paths: [
      {
        d: 'M10.3 21.65C8.39 21.34 6.19 19.75 4.17 17.23C2.24 14.82 0.43 11.51 0.11 9.84C-0.1 8.71 0.02 7.98 0.52 7.42C0.74 7.16 1.41 6.71 1.89 6.48C2.34 6.28 3.48 5.89 3.96 5.79C4.46 5.68 5.58 5.52 6.61 5.41L7.42 5.32L8.17 4.75C11.23 2.42 14.06 0.87 16.36 0.27C18.23 -0.22 19.54 -0.05 20.6 0.82C22.41 2.3 23.68 5.38 23.96 8.96C24.02 9.75 23.99 11.57 23.9 12.23C23.64 14.09 23.17 15.45 22.41 16.57C21.32 18.16 17.16 20.48 13.87 21.34C12.97 21.57 12.24 21.68 11.42 21.69C10.9 21.7 10.56 21.69 10.3 21.65ZM18.52 15.4C19.33 14.5 20.2 13.4 20.77 12.56C21.66 11.27 21.97 9.78 21.56 8.85C21.23 8.12 19.91 7.4 18.17 7.01C15.81 6.49 12.19 6.41 8.82 6.82C7.93 6.93 7.8 6.99 7.13 7.59C5.17 9.36 4 10.55 3.62 11.17L3.52 11.33L3.79 11.59C4.56 12.31 5.58 12.85 7.53 13.56C10.63 14.69 15.33 15.76 17.93 15.92C18.03 15.93 18.12 15.84 18.52 15.4Z',
        fill: '#2A1246',
      },
      {
        d: 'M15.02 20.15C16.88 18.97 18.75 17.13 20.27 15.01C21.38 13.45 22.29 11.77 22.68 10.54C22.9 9.86 22.97 9.48 22.97 8.94C22.98 8.53 22.96 8.42 22.87 8.17C22.68 7.62 22.39 7.28 21.84 6.92C20.76 6.22 18.54 5.73 15.75 5.57C14.78 5.51 10.57 5.54 9.46 5.61C5.64 5.86 3.19 6.23 1.6 6.8C1.33 6.9 1.1 6.98 1.09 6.97C1.06 6.94 1.62 6.61 1.92 6.47C2.42 6.24 3.55 5.87 4.1 5.76C4.67 5.65 5.75 5.5 6.99 5.36L7.84 5.27L8.21 5.05C9.42 4.35 10.99 3.54 12.34 2.93C14.15 2.11 15.93 1.51 17.34 1.24C17.74 1.16 17.97 1.14 18.7 1.15C19.51 1.15 19.6 1.15 20.01 1.26C20.99 1.5 21.51 1.88 22.04 2.73C23.03 4.32 23.73 6.76 23.88 9.1C23.99 10.71 23.75 12.61 23.27 14.06C22.95 15 22.37 16.08 21.9 16.62L21.75 16.78L21.9 16.48C22.33 15.61 22.92 14.26 22.92 14.15C22.92 14.14 22.79 14.38 22.64 14.69C22.31 15.34 21.88 16.01 21.27 16.81C20.84 17.37 20.67 17.57 20.91 17.21C21.34 16.59 21.87 15.61 22.18 14.87C22.46 14.19 22.46 14.15 22.16 14.7C21.43 16.07 20.53 17.27 19.51 18.2L19.2 18.49L19.61 17.97C20.94 16.3 21.94 14.57 22.38 13.17C22.45 12.96 22.49 12.79 22.49 12.78C22.48 12.78 22.38 13.02 22.25 13.32C21.81 14.42 21.35 15.21 20.59 16.15C19.85 17.08 18.85 18.11 17.8 19.01C17.52 19.26 17.58 19.18 18.16 18.59C19.29 17.43 20.11 16.34 21.01 14.82C21.32 14.31 21.48 14.02 21.44 14.02C21.43 14.02 21.33 14.16 21.22 14.32C21.1 14.49 20.81 14.9 20.56 15.23C19.02 17.3 17.98 18.33 16.38 19.39C15.84 19.76 14.7 20.42 14.62 20.42C14.6 20.42 14.78 20.3 15.02 20.15ZM11.11 20.04C9.54 19.82 7.17 18 5.01 15.37C3.27 13.24 2.09 11.12 1.81 9.59C1.73 9.15 1.74 8.44 1.83 8.28C1.88 8.18 1.89 8.21 2 8.71C2.16 9.48 2.33 9.87 2.78 10.55C3.39 11.46 4.27 12.18 5.97 13.16C6.5 13.47 8.19 14.32 8.84 14.6C11.52 15.77 14.36 16.61 16.5 16.88L17.07 16.95L16.71 17.25C16.29 17.59 16.42 17.57 15.45 17.4C13.36 17.03 10.54 16.02 7.79 14.64C7.3 14.39 6.9 14.2 6.9 14.2C6.9 14.23 7.85 14.8 8.46 15.14C10.84 16.46 13.47 17.47 15.47 17.81C15.76 17.85 16 17.9 16 17.9C16.01 17.91 15.85 18.02 15.64 18.15L15.27 18.39L14.9 18.32C12.85 17.95 9.81 16.57 7.01 14.75C6.24 14.25 6.26 14.27 7.15 14.95C9.26 16.53 11.63 17.81 13.41 18.33C13.83 18.45 14.72 18.63 14.91 18.64C15 18.64 13.85 19.36 13.37 19.59C12.79 19.87 12.44 19.99 11.97 20.05C11.58 20.1 11.48 20.1 11.11 20.04ZM12.17 19.61C10.23 19.19 7.68 17.38 5.03 14.54L4.61 14.08L4.95 14.54C6.83 17.02 9.01 18.9 10.64 19.44C11.16 19.61 11.47 19.67 11.96 19.67L12.42 19.67L12.17 19.61ZM13.92 19.19C13.98 19.18 14.02 19.15 14.02 19.14C14.02 19.12 13.84 19.08 13.63 19.04C11.71 18.67 8.88 17.04 5.99 14.66L5.55 14.3L6.11 14.86C8.23 16.95 10.73 18.57 12.56 19.04C13.11 19.18 13.72 19.25 13.92 19.19ZM22.51 6.49C21.76 5.55 20.41 5.02 18.36 4.87C17.41 4.79 14.23 4.83 13.44 4.93C13.1 4.96 12.83 5 12.82 5.01C12.81 5.02 13.15 5.02 13.57 5C14.48 4.98 16.7 5.05 17.62 5.14C18.95 5.26 20.38 5.56 21.15 5.87C21.61 6.05 22.25 6.38 22.42 6.53C22.62 6.7 22.66 6.69 22.51 6.49ZM21.98 4.92C21.52 4.49 20.71 4.17 19.66 4.01C19 3.9 16.94 3.9 15.97 4.01C14.85 4.13 12.44 4.51 12.49 4.56C12.5 4.57 12.91 4.53 13.4 4.47C15.03 4.29 15.52 4.26 17.18 4.26C18.6 4.26 18.86 4.28 19.45 4.36C20.58 4.51 21.51 4.76 21.98 5.03C22.1 5.1 22.2 5.15 22.21 5.15C22.22 5.15 22.12 5.05 21.98 4.92ZM13.5 3.87C15.18 3.54 16.39 3.37 17.72 3.28C19.25 3.18 20.78 3.37 21.62 3.75L21.9 3.87L21.77 3.74C21.47 3.42 20.74 3.11 19.96 2.97C19.38 2.86 17.96 2.87 17.09 2.99C15.91 3.15 14.82 3.39 13.29 3.81C12.1 4.14 12.11 4.15 13.5 3.87ZM12.67 3.48C15.58 2.52 17.48 2.16 19.24 2.22C19.96 2.24 20.43 2.31 20.87 2.45L21.11 2.54L20.96 2.41C20.46 1.97 19.36 1.74 18.23 1.83C16.57 1.96 14.88 2.43 12.6 3.38C11.94 3.66 11.54 3.84 11.65 3.81C11.68 3.8 12.14 3.65 12.67 3.48Z',
        fill: '#7340B8',
      },
      {
        d: 'M15.06 20.16C15.06 20.15 15.19 20.05 15.36 19.94C17.2 18.72 19.11 16.76 20.58 14.58C22.1 12.33 22.92 10.47 22.99 9.11C23.03 8.3 22.86 7.84 22.34 7.32C21.99 6.96 21.62 6.73 21.07 6.51C19.04 5.69 15.77 5.37 11.06 5.53C6.87 5.67 3.75 6.07 1.81 6.72C1.23 6.91 1.16 6.92 1.27 6.84C1.64 6.53 3.17 5.95 4.1 5.76C5.23 5.53 7.37 5.3 9.94 5.13C11.27 5.05 15.09 5.01 16.31 5.07C19.21 5.22 21.17 5.68 22.34 6.49C23.32 7.17 23.67 8.06 23.44 9.28C23.35 9.77 23.04 10.89 22.85 11.38C22.46 12.44 21.67 13.74 20.39 15.43C19.02 17.24 18.14 18.13 16.76 19.12C16.26 19.48 15.06 20.21 15.06 20.16ZM10.98 20C9.74 19.76 8.08 18.63 6.36 16.86C4.04 14.47 2.24 11.61 1.85 9.69C1.76 9.27 1.75 8.52 1.83 8.34C1.88 8.22 1.88 8.24 1.99 8.78C2.32 10.35 2.88 11.55 4.25 13.58C5.08 14.81 5.88 15.78 6.97 16.87C8.8 18.71 10.34 19.61 11.78 19.7C12.43 19.74 13.31 19.52 14.11 19.11C14.27 19.03 14.39 18.97 14.39 18.98C14.39 19.02 13.53 19.51 13.23 19.65C12.84 19.82 12.58 19.91 12.23 19.99C11.93 20.05 11.27 20.06 10.98 20Z',
        fill: '#CC8FF3',
      },
    ],
  },
  {
    name: 'Meta',
    viewBox: '0 3.99 24 16.02',
    width: 30,
    height: 20,
    gradients: [
      {
        id: 'agentx-meta-0',
        x1: '75.897%',
        y1: '89.199%',
        x2: '26.312%',
        y2: '12.194%',
        stops: [
          { offset: '.06%', color: '#0867DF' },
          { offset: '45.39%', color: '#0668E1' },
          { offset: '85.91%', color: '#0064E0' },
        ],
      },
      {
        id: 'agentx-meta-1',
        x1: '21.67%',
        y1: '75.874%',
        x2: '97.068%',
        y2: '23.985%',
        stops: [
          { offset: '13.23%', color: '#0064DF' },
          { offset: '99.88%', color: '#0064E0' },
        ],
      },
      {
        id: 'agentx-meta-2',
        x1: '38.263%',
        y1: '89.127%',
        x2: '60.895%',
        y2: '16.131%',
        stops: [
          { offset: '1.47%', color: '#0072EC' },
          { offset: '68.81%', color: '#0064DF' },
        ],
      },
      {
        id: 'agentx-meta-3',
        x1: '47.032%',
        y1: '90.19%',
        x2: '52.15%',
        y2: '15.745%',
        stops: [
          { offset: '7.31%', color: '#007CF6' },
          { offset: '99.43%', color: '#0072EC' },
        ],
      },
      {
        id: 'agentx-meta-4',
        x1: '52.155%',
        y1: '58.301%',
        x2: '47.591%',
        y2: '37.004%',
        stops: [
          { offset: '7.31%', color: '#007FF9' },
          { offset: '100%', color: '#007CF6' },
        ],
      },
      {
        id: 'agentx-meta-5',
        x1: '37.689%',
        y1: '12.502%',
        x2: '61.961%',
        y2: '63.624%',
        stops: [
          { offset: '7.31%', color: '#007FF9' },
          { offset: '100%', color: '#0082FB' },
        ],
      },
      {
        id: 'agentx-meta-6',
        x1: '34.808%',
        y1: '68.859%',
        x2: '62.313%',
        y2: '23.174%',
        stops: [
          { offset: '27.99%', color: '#007FF8' },
          { offset: '91.41%', color: '#0082FB' },
        ],
      },
      {
        id: 'agentx-meta-7',
        x1: '43.762%',
        y1: '6.235%',
        x2: '57.602%',
        y2: '98.514%',
        stops: [
          { offset: '0%', color: '#0082FB' },
          { offset: '99.95%', color: '#0081FA' },
        ],
      },
      {
        id: 'agentx-meta-8',
        x1: '60.055%',
        y1: '4.661%',
        x2: '39.88%',
        y2: '69.077%',
        stops: [
          { offset: '6.19%', color: '#0081FA' },
          { offset: '100%', color: '#0080F9' },
        ],
      },
      {
        id: 'agentx-meta-9',
        x1: '30.282%',
        y1: '59.32%',
        x2: '61.081%',
        y2: '33.244%',
        stops: [
          { offset: '0%', color: '#027AF3' },
          { offset: '100%', color: '#0080F9' },
        ],
      },
      {
        id: 'agentx-meta-10',
        x1: '20.433%',
        y1: '50.001%',
        x2: '82.112%',
        y2: '50.001%',
        stops: [
          { offset: '0%', color: '#0377EF' },
          { offset: '99.94%', color: '#0279F1' },
        ],
      },
      {
        id: 'agentx-meta-11',
        x1: '40.303%',
        y1: '35.298%',
        x2: '72.394%',
        y2: '57.811%',
        stops: [
          { offset: '.19%', color: '#0471E9' },
          { offset: '100%', color: '#0377EF' },
        ],
      },
      {
        id: 'agentx-meta-12',
        x1: '32.254%',
        y1: '19.719%',
        x2: '68.003%',
        y2: '84.908%',
        stops: [
          { offset: '27.65%', color: '#0867DF' },
          { offset: '100%', color: '#0471E9' },
        ],
      },
    ],
    paths: [
      {
        d: 'M6.897 4h-.024l-.031 2.615h.022c1.715 0 3.046 1.357 5.94 6.246l.175.297.012.02 1.62-2.438-.012-.019a48.763 48.763 0 00-1.098-1.716 28.01 28.01 0 00-1.175-1.629C10.413 4.932 8.812 4 6.896 4z',
        fill: 'url(#agentx-meta-0)',
      },
      {
        d: 'M6.873 4C4.95 4.01 3.247 5.258 2.02 7.17a4.352 4.352 0 00-.01.017l2.254 1.231.011-.017c.718-1.083 1.61-1.774 2.568-1.785h.021L6.896 4h-.023z',
        fill: 'url(#agentx-meta-1)',
      },
      {
        d: 'M2.019 7.17l-.011.017C1.2 8.447.598 9.995.274 11.664l-.005.022 2.534.6.004-.022c.27-1.467.786-2.828 1.456-3.845l.011-.017L2.02 7.17z',
        fill: 'url(#agentx-meta-2)',
      },
      {
        d: 'M2.807 12.264l-2.533-.6-.005.022c-.177.918-.267 1.851-.269 2.786v.023l2.598.233v-.023a12.591 12.591 0 01.21-2.44z',
        fill: 'url(#agentx-meta-3)',
      },
      {
        d: 'M2.677 15.537a5.462 5.462 0 01-.079-.813v-.022L0 14.468v.024a8.89 8.89 0 00.146 1.652l2.535-.585a4.106 4.106 0 01-.004-.022z',
        fill: 'url(#agentx-meta-4)',
      },
      {
        d: 'M3.27 16.89c-.284-.31-.484-.756-.589-1.328l-.004-.021-2.535.585.004.021c.192 1.01.568 1.85 1.106 2.487l.014.017 2.018-1.745a2.106 2.106 0 01-.015-.016z',
        fill: 'url(#agentx-meta-5)',
      },
      {
        d: 'M10.78 9.654c-1.528 2.35-2.454 3.825-2.454 3.825-2.035 3.2-2.739 3.917-3.871 3.917a1.545 1.545 0 01-1.186-.508l-2.017 1.744.014.017C2.01 19.518 3.058 20 4.356 20c1.963 0 3.374-.928 5.884-5.33l1.766-3.13a41.283 41.283 0 00-1.227-1.886z',
        fill: '#0082FB',
      },
      {
        d: 'M13.502 5.946l-.016.016c-.4.43-.786.908-1.16 1.416.378.483.768 1.024 1.175 1.63.48-.743.928-1.345 1.367-1.807l.016-.016-1.382-1.24z',
        fill: 'url(#agentx-meta-6)',
      },
      {
        d: 'M20.918 5.713C19.853 4.633 18.583 4 17.225 4c-1.432 0-2.637.787-3.723 1.944l-.016.016 1.382 1.24.016-.017c.715-.747 1.408-1.12 2.176-1.12.826 0 1.6.39 2.27 1.075l.015.016 1.589-1.425-.016-.016z',
        fill: '#0082FB',
      },
      {
        d: 'M23.998 14.125c-.06-3.467-1.27-6.566-3.064-8.396l-.016-.016-1.588 1.424.015.016c1.35 1.392 2.277 3.98 2.361 6.971v.023h2.292v-.022z',
        fill: 'url(#agentx-meta-7)',
      },
      {
        d: 'M23.998 14.15v-.023h-2.292v.022c.004.14.006.282.006.424 0 .815-.121 1.474-.368 1.95l-.011.022 1.708 1.782.013-.02c.62-.96.946-2.293.946-3.91 0-.083 0-.165-.002-.247z',
        fill: 'url(#agentx-meta-8)',
      },
      {
        d: 'M21.344 16.52l-.011.02c-.214.402-.519.67-.917.787l.778 2.462a3.493 3.493 0 00.438-.182 3.558 3.558 0 001.366-1.218l.044-.065.012-.02-1.71-1.784z',
        fill: 'url(#agentx-meta-9)',
      },
      {
        d: 'M19.92 17.393c-.262 0-.492-.039-.718-.14l-.798 2.522c.449.153.927.222 1.46.222.492 0 .943-.073 1.352-.215l-.78-2.462c-.167.05-.341.075-.517.073z',
        fill: 'url(#agentx-meta-10)',
      },
      {
        d: 'M18.323 16.534l-.014-.017-1.836 1.914.016.017c.637.682 1.246 1.105 1.937 1.337l.797-2.52c-.291-.125-.573-.353-.9-.731z',
        fill: 'url(#agentx-meta-11)',
      },
      {
        d: 'M18.309 16.515c-.55-.642-1.232-1.712-2.303-3.44l-1.396-2.336-.011-.02-1.62 2.438.012.02.989 1.668c.959 1.61 1.74 2.774 2.493 3.585l.016.016 1.834-1.914a2.353 2.353 0 01-.014-.017z',
        fill: 'url(#agentx-meta-12)',
      },
    ],
  },
  {
    name: 'Microsoft',
    viewBox: '0 0 256 256',
    width: 20,
    height: 20,
    paths: [
      { d: 'M121.666 121.666H0V0h121.666z', fill: '#F1511B' },
      { d: 'M256 121.666H134.335V0H256z', fill: '#80CC28' },
      { d: 'M121.663 256.002H0V134.336h121.663z', fill: '#00ADEF' },
      { d: 'M256 256.002H134.335V134.336H256z', fill: '#FBBC09' },
    ],
  },
  {
    name: 'Oracle',
    viewBox: '0 0 231 30',
    width: 108,
    height: 14,
    paths: [
      {
        d: 'M99.61,19.52h15.24l-8.05-13L92,30H85.27l18-28.17a4.29,4.29,0,0,1,7-.05L128.32,30h-6.73l-3.17-5.25H103l-3.36-5.23m69.93,5.23V0.28h-5.72V27.16a2.76,2.76,0,0,0,.85,2,2.89,2.89,0,0,0,2.08.87h26l3.39-5.25H169.54M75,20.38A10,10,0,0,0,75,.28H50V30h5.71V5.54H74.65a4.81,4.81,0,0,1,0,9.62H58.54L75.6,30h8.29L72.43,20.38H75M14.88,30H32.15a14.86,14.86,0,0,0,0-29.71H14.88a14.86,14.86,0,1,0,0,29.71m16.88-5.23H15.26a9.62,9.62,0,0,1,0-19.23h16.5a9.62,9.62,0,1,1,0,19.23M140.25,30h17.63l3.34-5.23H140.64a9.62,9.62,0,1,1,0-19.23h16.75l3.38-5.25H140.25a14.86,14.86,0,1,0,0,29.71m69.87-5.23a9.62,9.62,0,0,1-9.26-7h24.42l3.36-5.24H200.86a9.61,9.61,0,0,1,9.26-7h16.76l3.35-5.25h-20.5a14.86,14.86,0,0,0,0,29.71h17.63l3.35-5.23h-20.6',
        fill: '#C74634',
      },
    ],
  },
] as const;

const LANDING_HIDDEN_LEDGER_MODELS: ReadonlySet<string> = new Set([
  'muse-spark-open',
  'deepseek-v4',
  'qwen-3-8-flash-next',
  'qwen-3-5',
  'minimax-m3',
  'kimi-k3',
  'glm-5-3',
]);

const LANDING_HARDWARE_RESULTS = [
  {
    id: 'huawei',
    vendor: 'Huawei',
    title: 'Huawei Ascend 950PR',
    titleZh: '华为 Ascend 950PR',
    subtitle: 'Core and Memory Profiles · uBenchX',
    subtitleZh: '核心与内存性能剖析 · uBenchX',
    href: '/ubx/core-memory-profiles',
    model: 'ascend950pr',
    analyticsEvent: 'landing_huawei_results_clicked',
    isNew: true,
  },
  {
    id: 'tpu-kimi-k3',
    vendor: 'Google',
    title: 'Google TPU',
    titleZh: 'Google TPU',
    subtitle: 'Kimi K3 · 2.8T Parameters · AgentX',
    subtitleZh: 'Kimi K3 · 2.8 万亿参数 · AgentX',
    href: `${getDashboardRoute('inference').path}/kimi-k3`,
    model: 'kimi-k3',
    analyticsEvent: 'landing_tpu_results_clicked',
    isNew: true,
  },
  {
    id: 'rubin-glm-5-3',
    vendor: 'NVIDIA',
    title: 'Vera Rubin NVL72',
    titleZh: 'Vera Rubin NVL72',
    subtitle: 'GLM 5.3 · 744B Parameters · AgentX',
    subtitleZh: 'GLM 5.3 · 7440 亿参数 · AgentX',
    href: `${getDashboardRoute('inference').path}/glm-5-3`,
    model: 'glm-5-3',
    analyticsEvent: 'landing_rubin_results_clicked',
  },
  {
    id: 'jalapeno',
    vendor: 'OpenAI',
    title: 'OpenAI Jalapeño',
    titleZh: 'OpenAI Jalapeño',
    subtitle: 'DeepSeek R1 · 8K/1K · FP4',
    href: `${getDashboardRoute('inference').path}/deepseek-r1?i_seq=8k%2F1k&i_prec=fp4&i_xmode=e2e`,
    model: 'deepseek-r1',
    analyticsEvent: 'landing_jalapeno_results_clicked',
  },
  {
    id: 'minimax-m31-flash',
    vendor: 'MiniMax',
    title: 'MiniMax M3.1 Flash',
    titleZh: 'MiniMax M3.1 Flash',
    subtitle: '428B Parameters · AgentX',
    subtitleZh: '4280 亿参数 · AgentX',
    href: `${getDashboardRoute('inference').path}/minimax-m31-flash`,
    model: 'minimax-m31-flash',
    analyticsEvent: 'landing_minimax_m31_flash_results_clicked',
  },
] as const;

const MODEL_SIZE_SUFFIX = /\s(?<amount>\d+(?:\.\d+)?)(?<unit>[BT])$/;

function ledgerTitle(label: string): string {
  return label.replace(MODEL_SIZE_SUFFIX, '');
}

function ledgerSubtitle(label: string, locale: 'en' | 'zh'): string {
  const size = MODEL_SIZE_SUFFIX.exec(label)?.groups;
  if (!size) return 'AgentX';
  const { amount, unit } = size;
  if (locale === 'en') return `${amount}${unit} parameters · AgentX`;
  const zh = unit === 'T' ? `${amount} 万亿` : `${Number(amount) * 10} 亿`;
  return `${zh}参数 · AgentX`;
}

const STRINGS = {
  en: {
    title: 'Compare Realistic Agentic Inference Performance',
    description:
      'Long-Context, Multi-Turn Inference Performance on Google TPUv7 Ironwood, OpenAI Jalapeño, MI355X, GB300 NVL72, GB200 NVL72, B200, H200, H100 and RTX Pro. TPUv8i, SambaNova SN50, Rubin NVL72 and MI455X UALoE72 are next.',
    revenueCalculator: 'Token Revenue Calculator',
    dashboard: 'Dashboard',
    ledgerTitle: 'Models with AgentX Results',
    modelAction: 'View results',
    newModel: 'New',
  },
  zh: {
    title: '真实智能体工作负载下的推理性能对比',
    description:
      '比较不同硬件平台在长上下文、多轮智能体工作负载下的推理性能，覆盖 Google TPUv7 Ironwood、OpenAI Jalapeño、MI355X、GB300 NVL72、GB200 NVL72、B200、H200、H100 和 RTX Pro，即将支持 TPUv8i、SambaNova SN50、Rubin NVL72 与 MI455X UALoE72。',
    revenueCalculator: 'Token 收入计算器',
    dashboard: '仪表板',
    ledgerTitle: '已发布 AgentX 结果的模型',
    modelAction: '查看结果',
    newModel: '新',
  },
} as const;

export function AgentXCompareHero({
  locale,
  headingLevel = 'h1',
  surface = 'compare',
}: {
  locale: 'en' | 'zh';
  headingLevel?: 'h1' | 'h2';
  surface?: 'compare' | 'landing';
}) {
  const t = STRINGS[locale];
  const prefix = locale === 'zh' ? '/zh' : '';
  const Heading = headingLevel;
  const ledgerModels =
    surface === 'landing'
      ? FEATURED_AGENTX_MODELS.filter((model) => !LANDING_HIDDEN_LEDGER_MODELS.has(model.slug))
      : FEATURED_AGENTX_MODELS;

  return (
    <section data-testid="compare-agentx-primary">
      <Card className="overflow-hidden p-0 md:p-0">
        <div className="grid lg:grid-cols-[minmax(0,1.15fr)_minmax(19rem,0.85fr)]">
          <div className="flex flex-col justify-center p-6 md:p-8 lg:p-10">
            <div className="relative">
              <Heading className="max-w-2xl text-3xl font-semibold text-foreground lg:text-4xl lg:tracking-heading">
                {t.title}
              </Heading>
              {surface === 'landing' && <MinecraftSplash />}
            </div>
            <p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground">
              {t.description}
            </p>
            <div
              aria-hidden="true"
              data-testid="compare-agentx-vendor-marks"
              className="mt-6 grid grid-cols-3 items-center gap-x-4 gap-y-3 text-foreground sm:flex sm:flex-wrap sm:gap-x-6 sm:gap-y-2"
            >
              {VENDOR_MARKS.filter((mark) => surface === 'landing' || mark.name !== 'Huawei').map(
                (mark) => (
                  <svg
                    key={mark.name}
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox={mark.viewBox}
                    width={mark.width}
                    height={mark.height}
                    className="h-auto max-w-full shrink-0"
                  >
                    {mark.gradients ? (
                      <defs>
                        {mark.gradients.map((gradient) => (
                          <linearGradient
                            key={gradient.id}
                            id={gradient.id}
                            x1={gradient.x1}
                            y1={gradient.y1}
                            x2={gradient.x2}
                            y2={gradient.y2}
                          >
                            {gradient.stops.map((stop) => (
                              <stop key={stop.offset} offset={stop.offset} stopColor={stop.color} />
                            ))}
                          </linearGradient>
                        ))}
                      </defs>
                    ) : null}
                    {mark.paths.map((path) => (
                      <path key={path.d} d={path.d} fill={path.fill} />
                    ))}
                  </svg>
                ),
              )}
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <CompareIndexTrackedLink
                data-testid="compare-agentx-revenue-calculator-link"
                href={`${prefix}${getDashboardRoute('profit-estimator-per-gigawatt').path}`}
                analyticsEvent="compare_agentx_revenue_calculator_clicked"
                analyticsSurface={surface}
                appNavigation
                className="group motion-press inline-flex min-h-11 items-center gap-2 rounded-md bg-brand-fill px-5 py-2.5 font-medium text-primary-foreground transition-colors hover:bg-brand-fill/90 max-[479px]:w-full max-[479px]:justify-center"
              >
                {t.revenueCalculator}
                <ArrowRight
                  aria-hidden="true"
                  className="size-4 motion-safe:transition-transform motion-safe:duration-200 motion-safe:group-hover:translate-x-0.5"
                />
              </CompareIndexTrackedLink>
              <CompareIndexTrackedLink
                data-testid="compare-agentx-dashboard-link"
                href={agentxDashboardHref(locale, FEATURED_AGENTX_MODELS[0])}
                analyticsEvent="compare_agentx_dashboard_clicked"
                analyticsTarget={FEATURED_AGENTX_MODELS[0].slug}
                analyticsSurface={surface}
                appNavigation
                className="group motion-press inline-flex min-h-11 items-center gap-2 rounded-md border border-border px-5 py-2.5 font-medium text-foreground transition-colors hover:bg-muted max-[479px]:w-full max-[479px]:justify-center"
              >
                {t.dashboard}
                <ArrowRight
                  aria-hidden="true"
                  className="size-4 motion-safe:transition-transform motion-safe:duration-200 motion-safe:group-hover:translate-x-0.5"
                />
              </CompareIndexTrackedLink>
            </div>
          </div>

          <div className="border-t border-border/30 bg-muted/20 lg:border-t-0 lg:border-l">
            {surface === 'landing' && (
              <div className="divide-y divide-border/20 border-b border-border/20">
                {LANDING_HARDWARE_RESULTS.map((result) => {
                  const mark = VENDOR_MARKS.find((vendor) => vendor.name === result.vendor);
                  return (
                    <CompareIndexTrackedLink
                      key={result.id}
                      data-testid={`landing-${result.id}-results-link`}
                      href={`${prefix}${result.href}`}
                      analyticsEvent={result.analyticsEvent}
                      analyticsTarget={result.model}
                      analyticsSurface={surface}
                      appNavigation
                      className="group flex min-h-14 items-center justify-between gap-4 px-5 py-3 transition-colors hover:bg-muted/60 focus-visible:outline-none"
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        {result.vendor === 'MiniMax' ? (
                          <img
                            data-testid={`landing-${result.id}-${result.vendor.toLowerCase()}-logo`}
                            src={MODEL_LOGOS[result.model]}
                            alt=""
                            aria-hidden="true"
                            width={32}
                            height={32}
                            loading="lazy"
                            className="size-8 shrink-0 object-contain"
                          />
                        ) : (
                          <svg
                            data-testid={`landing-${result.id}-${result.vendor.toLowerCase()}-logo`}
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox={mark!.viewBox}
                            width={32}
                            height={32}
                            aria-hidden="true"
                            className="size-8 shrink-0 text-foreground"
                          >
                            {mark!.paths.map((path) => (
                              <path key={path.d} d={path.d} fill={path.fill} />
                            ))}
                          </svg>
                        )}
                        <span className="min-w-0">
                          <span className="block text-sm font-medium leading-tight text-foreground">
                            {locale === 'zh' ? result.titleZh : result.title}
                            {'isNew' in result && result.isNew && (
                              <NewBadge
                                data-new-badge={`landing-${result.id}`}
                                flashing
                                className="ml-2 align-[-0.125em]"
                              >
                                {t.newModel}
                              </NewBadge>
                            )}
                          </span>
                          <span className="mt-1 block text-xs text-muted-foreground">
                            {locale === 'zh' && 'subtitleZh' in result
                              ? result.subtitleZh
                              : result.subtitle}
                          </span>
                        </span>
                      </span>
                      <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground group-hover:text-brand">
                        <span className="max-sm:sr-only">{t.modelAction}</span>
                        <ArrowRight
                          aria-hidden="true"
                          className="size-3.5 max-sm:hidden motion-safe:transition-transform motion-safe:duration-200 motion-safe:group-hover:translate-x-0.5"
                        />
                        <ChevronRight aria-hidden="true" className="size-5 sm:hidden" />
                      </span>
                    </CompareIndexTrackedLink>
                  );
                })}
              </div>
            )}
            <nav aria-label={t.ledgerTitle} className="divide-y divide-border/20">
              {ledgerModels.map((model) => (
                <CompareIndexTrackedLink
                  key={model.slug}
                  data-testid={`compare-agentx-model-${model.slug}`}
                  href={agentxDashboardHref(locale, model)}
                  analyticsEvent="compare_agentx_model_clicked"
                  analyticsTarget={model.slug}
                  analyticsSurface={surface}
                  appNavigation
                  className="group flex min-h-14 items-center justify-between gap-4 px-5 py-3 transition-colors hover:bg-muted/60 focus-visible:outline-none"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    {MODEL_LOGOS[model.slug] && (
                      <img
                        src={MODEL_LOGOS[model.slug]}
                        alt=""
                        aria-hidden="true"
                        width={32}
                        height={32}
                        loading="lazy"
                        className="size-8 shrink-0 object-contain"
                      />
                    )}
                    <span className="min-w-0">
                      <span className="block text-sm font-medium leading-tight text-foreground">
                        {ledgerTitle(model.label)}
                        {isNewAgentxModel(model) && (
                          <NewBadge
                            data-new-badge="agentx-ledger"
                            className="ml-2 align-[-0.125em]"
                          >
                            {t.newModel}
                          </NewBadge>
                        )}
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {ledgerSubtitle(model.label, locale)}
                      </span>
                    </span>
                  </span>
                  <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground group-hover:text-brand">
                    <span className="max-sm:sr-only">{t.modelAction}</span>
                    <ArrowRight
                      aria-hidden="true"
                      className="size-3.5 max-sm:hidden motion-safe:transition-transform motion-safe:duration-200 motion-safe:group-hover:translate-x-0.5"
                    />
                    <ChevronRight aria-hidden="true" className="size-5 sm:hidden" />
                  </span>
                </CompareIndexTrackedLink>
              ))}
            </nav>
          </div>
        </div>
      </Card>
    </section>
  );
}
