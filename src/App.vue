<template>
  <!-- 最外层：两列 CSS Grid 布局：左列参数面板，右列预览 -->
  <div class="grid">
    <div class="panel">
      <h2 style="margin:0 0 8px">分形维数单元基底生成（AUPG）</h2>
      <hr />

      <!-- 随机数发生器 | 单选组 + 两个种子 -->
      <div class="panel" style="padding:10px; margin:10px 0">
        <div style="font-weight:600; margin-bottom:6px">随机数生成器</div>
        <div class="flex">
          <label class="checkbox"><input type="radio" name="rng" value="parkmiller" v-model="rng">Park&Miller</label>
          <label class="checkbox"><input type="radio" name="rng" value="baysdurham" v-model="rng">BaysDurham</label>
          <label class="checkbox"><input type="radio" name="rng" value="lecuyer" v-model="rng">L'Ecuyer</label>
        </div>
        <div class="row" style="margin-top:6px">
          <div><label>Seed 1</label><input type="number" v-model.number="seed1" /></div>
          <div><label>Seed 2</label><input type="number" v-model.number="seed2" /></div>
        </div>
      </div>

      <div class="panel" style="padding:10px; margin:10px 0">
        <!-- 分辨率选择器 -->
        <label>生成面分辨率</label>
        <!-- name="res" 让 5 个 radio 互斥 | v-model.number="res" 把字符值强制转成数字 -->
        <div class="flex">
          <label class="checkbox"><input type="radio" name="res" value="64" v-model.number="res"> 0064×0064 </label>
          <label class="checkbox"><input type="radio" name="res" value="128" v-model.number="res"> 0128×0128 </label>
          <label class="checkbox"><input type="radio" name="res" value="256" v-model.number="res"> 0256×0256 </label>
          <label class="checkbox"><input type="radio" name="res" value="512" v-model.number="res"> 0512×0512 </label>
          <label class="checkbox"><input type="radio" name="res" value="1024" v-model.number="res"> 1024×1024 </label>
        </div>

        <!-- 生成面配置参数 Parameters -->
        <div class="row">
          <div><label>Physical size (mm)</label><input type="number" v-model.number="sizeMM" step="1" /></div>
          <div><label>Mismatch length (mm)</label><input type="number" v-model.number="mismatchMM" step="1" /></div>
        </div>
        <div class="row">
          <div><label>Transition length (mm)</label><input type="number" v-model.number="transitionMM" step="1" /></div>
          <div><label>Standard deviation (mm)</label><input type="number" v-model.number="stdMM" step="0.01" /></div>
        </div>
        <div class="row">
          <div><label>Anisotropy factor</label><input type="number" v-model.number="aniso" step="0.01" /></div>
          <div><label>Fractal dimension</label><input type="number" v-model.number="D" step="0.01" /></div>
        </div>
        <div class="row">
          <div><label>Max matching fraction</label><input type="number" v-model.number="mfmax" min="0" max="1"
              step="0.01" /></div>
          <div><label>Min matching fraction</label><input type="number" v-model.number="mfmin" min="0" max="1"
              step="0.01" /></div>
        </div>
      </div>

      <div class="panel" style="padding:10px; margin:10px 0">
        <div class="flex" style="margin-top:10px">
          <!-- 调用 run() 生成一次基底面 -->
          <button class="primary" @click="run">[ 生成结果 ]</button>
          <!-- 导出 Bottom 的 STL -->
          <button class="ghost" @click="exportSTL">[ 保存文件 ]</button>
          <!-- 显示分辨率、D、耗时等信息 -->
          <span class="badge">{{ info }}</span>
        </div>
      </div>
    </div>

    <div class="panel">
      <!-- 只有在 ZB（底面网格高程矩阵）生成后才渲染 -->
      <SurfaceViewer v-if="ZB" :z="ZB" :Lx="L" :Ly="L" label="Bottom" />
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { generateAUPG } from './lib/aupg' // 核心算法（频域自仿射 + AUPG 匹配），返回 { ZA, ZB, meta }。此处只用 ZB（Bottom）
import { gridToSTL } from './lib/stl'
import SurfaceViewer from './components/SurfaceViewer.vue'

// 部分响应式参数的默认值
const res = ref(64) // 分辨率
const rng = ref('parkmiller') // 随机数发生器类型
const seed1 = ref(799753397) // A 面随机种子
const seed2 = ref(737375979) // 噪声 N 的随机种子

const sizeMM = ref(100) // 物理尺寸（mm）
const mismatchMM = ref(15)   // ML （mm）
const transitionMM = ref(10) // TL （mm）
const stdMM = ref(1.0) // σz (mm)
const aniso = ref(1.0) // 各向异性 x相对于y
const D = ref(2.5) // 分形维数
const mfmax = ref(1.0) // 长波极限相关
const mfmin = ref(0.0) // 短波极限相关

const nx = computed(() => res.value)
const ny = computed(() => res.value)
const L = computed(() => sizeMM.value / 1000) // mm → m

const ZB = ref(null) // 生成的 Bottom 面高程矩阵（二维数组 ny × nx）
const info = ref('')

function run() {
  const t0 = performance.now()
  const { ZB: bottom } = generateAUPG({
    nx: nx.value, ny: ny.value, L: L.value,
    D: D.value,
    sigma: stdMM.value / 1000,     // mm -> m
    anisotropy: aniso.value,
    mfmin: mfmin.value, mfmax: mfmax.value,
    TL: transitionMM.value / 1000, // mm -> m
    ML: mismatchMM.value / 1000,   // mm -> m
    rngKind: rng.value, seed1: seed1.value, seed2: seed2.value
  })
  ZB.value = bottom
  info.value = `${res.value}×${res.value} | D=${D.value.toFixed(2)} | ${(performance.now() - t0).toFixed(0)} ms`
}

function saveBlob(blob, filename) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

// gridToSTL 把 ZB + 物理尺寸 Lx/Ly 网格化为三角片，输出 ASCII STL 的 Blob
function exportSTL() {
  if (!ZB.value) return
  const blob = gridToSTL(ZB.value, L.value, L.value, 'surface_bottom')
  saveBlob(blob, 'surface_bottom.stl')
}
</script>
