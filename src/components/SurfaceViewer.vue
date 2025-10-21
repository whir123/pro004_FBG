<template>
  <div ref="wrap" style="width:100%;height:100%;position:relative">
    <canvas ref="canvas" style="width:100%;height:100%"></canvas>
    <div style="position:absolute;left:12px;bottom:12px" class="badge">{{ label }}</div>
  </div>
</template>

<script setup>
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import * as THREE from 'three'

const props = defineProps({
  z: { type: Array, required: true },
  Lx: { type: Number, required: true },
  Ly: { type: Number, required: true },
  label: { type: String, default: '' }
})

const wrap = ref(null)
const canvas = ref(null)
let renderer, scene, camera, mesh, cleanup = () => { }

function buildGeometry() {
  const ny = props.z.length, nx = props.z[0].length
  const geo = new THREE.PlaneGeometry(props.Lx, props.Ly, nx - 1, ny - 1)
  const pos = geo.attributes.position
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) pos.setZ(j * nx + i, props.z[j][i])
  pos.needsUpdate = true
  geo.computeVertexNormals()
  return geo
}

function init() {
  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x0b0f14)
  const maxL = Math.max(props.Lx, props.Ly)
  camera = new THREE.PerspectiveCamera(50, wrap.value.clientWidth / wrap.value.clientHeight, 0.01, 100)
  camera.position.set(0, -maxL * 1.2, maxL * 0.8)
  camera.up.set(0, 0, 1); camera.lookAt(0, 0, 0)

  renderer = new THREE.WebGLRenderer({ canvas: canvas.value, antialias: true })
  renderer.setPixelRatio(window.devicePixelRatio)
  renderer.setSize(wrap.value.clientWidth, wrap.value.clientHeight)

  mesh = new THREE.Mesh(buildGeometry(), new THREE.MeshStandardMaterial({ color: 0x6ba7ff, metalness: 0.1, roughness: 0.9, side: THREE.DoubleSide }))
  scene.add(mesh)

  const grid = new THREE.GridHelper(maxL * 1.2, 10)
  grid.rotateX(Math.PI / 2); scene.add(grid)
  scene.add(new THREE.AmbientLight(0xffffff, 0.6))
  const dir = new THREE.DirectionalLight(0xffffff, 1.0); dir.position.set(1, -1, 2); scene.add(dir)

  const onResize = () => {
    renderer.setSize(wrap.value.clientWidth, wrap.value.clientHeight)
    camera.aspect = wrap.value.clientWidth / wrap.value.clientHeight
    camera.updateProjectionMatrix()
  }
  window.addEventListener('resize', onResize)

  let raf; const loop = () => { renderer.render(scene, camera); raf = requestAnimationFrame(loop) }; loop()
  cleanup = () => { cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); renderer.dispose() }
}

onMounted(() => init())
onBeforeUnmount(() => cleanup())
watch(() => props.z, () => { if (!mesh) return; const g = buildGeometry(); mesh.geometry.dispose(); mesh.geometry = g })
</script>
