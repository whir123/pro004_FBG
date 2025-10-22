<template>
  <div ref="wrap" style="width:100%; height:100%; position:relative">
    <!-- 3D WebGL 画布 -->
    <canvas ref="glCanvas" v-show="mode==='3d'" style="width:715px; height:715px"></canvas>
    <!-- 2D 像素图画布 -->
    <canvas ref="grayCanvas" v-show="mode==='2d'" style="width:715px; height:715px"></canvas>
    <div class="toolbar">
      <button v-if="mode==='3d'" @click="resetView" title="重置相机视角" style="width: 80px;">重置视角</button>
      <button :class="{ active: mode==='3d' }" @click="setMode('3d')">3D</button>
      <button :class="{ active: mode==='2d' }" @click="setMode('2d')">2D</button>
    </div>
  </div>
</template>

<script setup>
import { onMounted, onBeforeUnmount, ref, watch, nextTick } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

const props = defineProps({
  z:  { type: Array,  required: true },  // ny x nx
  Lx: { type: Number, required: true },
  Ly: { type: Number, required: true },
})

const glCanvas = ref(null);
const grayCanvas = ref(null);
const mode = ref('3d');

let renderer, scene;
let camera3D, activeCamera;
let controls, mesh3D, gridHelper;
let raf = 0;

function zMinMax(z){
  let mn=Infinity, mx=-Infinity;
  const ny=z.length, nx=z[0].length;
  for(let j=0;j<ny;j++) {
    for(let i=0;i<nx;i++){ 
      const v=z[j][i];
      if(v<mn) mn=v;
      if(v>mx) mx=v;
    };
  };
  return { mn, mx, range: mx - mn }
}

// ---------------- 3D 部分 ----------------
function buildGeometry3D() {
  const ny = props.z.length, nx = props.z[0].length;
  const geo = new THREE.PlaneGeometry(props.Lx, props.Ly, nx - 1, ny - 1);
  const pos = geo.attributes.position;
  for (let j=0;j<ny;j++) {
    for (let i=0;i<nx;i++) {
      pos.setZ(j*nx+i, props.z[j][i]);
    };
  };
  pos.needsUpdate = true;
  geo.computeVertexNormals()
  return geo;
};

function init3D() {
  // 创建场景 设置背景
  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x222222)

  renderer = new THREE.WebGLRenderer({ canvas: glCanvas.value, antialias: true })
  renderer.setPixelRatio(window.devicePixelRatio);
  // 读取 CSS 大小作为渲染像素大小（715×715 兜底）
  const w = glCanvas.value.clientWidth || 715;
  const h = glCanvas.value.clientHeight || 715;
  renderer.setSize(w, h);

  camera3D = new THREE.PerspectiveCamera(50, w / h, 0.01, 2000);
  const maxL = Math.max(props.Lx, props.Ly);
  const fit = (maxL) / (2 * Math.tan(THREE.MathUtils.degToRad(camera3D.fov) / 2));
  const dist = fit * 0.9;
  // 初始相机位置
  camera3D.position.set(0, -dist, dist*1.4);
  camera3D.up.set(0,0,1); camera3D.lookAt(0,0,0);
  activeCamera = camera3D;
  // 鼠标交互设置
  controls = new OrbitControls(camera3D, renderer.domElement)
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enableZoom = true;
  controls.enablePan = false; // 固定旋转中心
  controls.target.set(0,0,0);
  controls.update();

  const geo3D = buildGeometry3D();
  const mat3D = new THREE.MeshStandardMaterial({
    color: 0xdddddd, metalness: 0.0, roughness: 0.95, flatShading: true, side: THREE.DoubleSide
  });
  mesh3D = new THREE.Mesh(geo3D, mat3D);
  scene.add(mesh3D);

  gridHelper = new THREE.GridHelper(maxL * 1.2, 10);
  gridHelper.rotateX(Math.PI / 2);
  scene.add(gridHelper);

  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const dir = new THREE.DirectionalLight(0xffffff, 1.0);
  dir.position.set(1, -1, 2);
  scene.add(dir);

  const loop = () => {
    if (mode.value === '3d') controls.update()
    renderer.render(scene, activeCamera)
    raf = requestAnimationFrame(loop)
  };
  loop();
};

function resetView() {
  if (!camera3D) return;
  // 读取画布尺寸（715×715 兜底）
  const w = glCanvas.value?.clientWidth || 715;
  const h = glCanvas.value?.clientHeight || 715;
  camera3D.aspect = w / h;
  camera3D.updateProjectionMatrix();

  const maxL = Math.max(props.Lx, props.Ly);
  const fit = maxL / (2 * Math.tan(THREE.MathUtils.degToRad(camera3D.fov) / 2));
  const dist = fit * 0.9

  // 相机回到默认位置 & 姿态（围绕原点俯视）
  camera3D.position.set(0, -dist, dist*1.4);
  camera3D.up.set(0, 0, 1);
  camera3D.lookAt(0, 0, 0);

  // OrbitControls 的旋转中心固定原点，并立即生效
  if (controls) {
    controls.target.set(0, 0, 0);
    controls.update();
  };
};

// ---------------- 2D 部分 ----------------
function draw2D() {
  if (!grayCanvas.value) return;
  const ctx = grayCanvas.value.getContext('2d');

  // 读取 CSS 尺寸（715 兜底）
  let W = grayCanvas.value.clientWidth;
  let H = grayCanvas.value.clientHeight;
  if (!W || !H) {
    const cs = getComputedStyle(grayCanvas.value)
    W = parseInt(cs.width)  || 715;
    H = parseInt(cs.height) || 715;
  };
  // 设置画布实际像素尺寸
  if (grayCanvas.value.width !== W) grayCanvas.value.width = W;
  if (grayCanvas.value.height !== H) grayCanvas.value.height = H;
  const ny = props.z.length, nx = props.z[0].length;

  // 先在离屏 nx×ny 画布生成像素
  const off = document.createElement('canvas');
  off.width = nx; off.height = ny;
  const octx = off.getContext('2d');
  const img = octx.createImageData(nx, ny);
  const buf = img.data;

  const { mn, range } = zMinMax(props.z);
  const safeRange = (range && isFinite(range)) ? range : 1;
  const toGray = (v) => {
    if (!range || !isFinite(range)) return 128 // 常数面：中灰
    const g = (v - mn) / safeRange;
    const t = Math.max(0, Math.min(1, g));
    return Math.round(255 * t);
  };
  // 写每个栅格像素的 RGBA（灰度 v、alpha=255）
  for (let j=0;j<ny;j++){
    for (let i=0;i<nx;i++){
      const v = toGray(props.z[j][i])
      const p = (j*nx + i) * 4
      buf[p+0] = v
      buf[p+1] = v
      buf[p+2] = v
      buf[p+3] = 255
    }
  }
  octx.putImageData(img, 0, 0)

  // 最近邻放大贴到可见画布
  ctx.save();
  ctx.imageSmoothingEnabled = false
  ctx.clearRect(0,0,W,H);
  ctx.drawImage(off, 0, 0, W, H);
  ctx.restore();
}

// ---------------- 2D/3D 模式切换 ----------------
async function setMode(m){
  if (m === mode.value) return
  mode.value = m
  if (mode.value === '2d') {
    // 等待 DOM 把 grayCanvas 从 display:none => block，再绘制
    await nextTick()
    requestAnimationFrame(() => draw2D())
  }
}

// 组件挂载时：初始化 3D 循环
onMounted(async () => {
  init3D();
  if (mode.value === '2d') {
    await nextTick();
    requestAnimationFrame(() => draw2D());
  };
});
// 组件卸载时：清理，停掉动画、释放 Three 资源，避免内存泄漏。
onBeforeUnmount(() => {
  cancelAnimationFrame(raf);
  controls && controls.dispose();
  renderer && renderer.dispose();
});
// 数据变化：3D 重建几何；2D 重画像素
watch(() => props.z, async () => {
  if (mesh3D) {
    const g3 = buildGeometry3D();
    mesh3D.geometry.dispose();
    mesh3D.geometry = g3;
  };
  if (mode.value === '2d') {
    await nextTick();
    requestAnimationFrame(() => draw2D());
  };
});
</script>
