/**
 * 🧐 Remarks
 * ==============================================================================================================
 * 
 * 【DFT】   | 离散傅里叶变换：把一串离散数据（比如1D信号、或2D高度场）分解成一堆不同频率/波数的【正/余波系数】
 * 【FFT】   | 是一种更快地算 DFT 的算法 把 O(N^2) 降到 O(NlogN)
 * 【IFFT】  | 反过来把频域系数还原回原来的信号/高度场
 * 【FFT】   | 有很多版本，radix-2 这版要求长度N必须是2^b (256 512 1024...)
 * 【时域】  | 直接看到或使用的信号（对该表面来说也叫【空间域】）
 *            1D：x[n]随时间或位置变化
 *            2D 表面：z(x,y)作为每个网格点的高度
 * 【频域】  | （对该表面来说也叫【波数域 / k 空间】）即：这组数据是由哪些波叠出来的
 *            1D：不同频率的正弦波各有多少（幅值）+ 相位
 *            2D：不同波矢 (kx,ky) 的平面波各有多少 + 相位
 *            本算法中：Z[j][i] => 空间域高度场z(x,y) | Re[j][i] + Im[j][i]·i => 频域复系数 F(kx,ky)
 * 
 * ==============================================================================================================
 * 
 * 每个频域格点(kx,ky)对应一个平面波 => cos(kx​·x+ky·​y+ϕ) | k越大 => 波长越短
 *        k=(kx,ky)：波矢（方向+尺度）  |  |k|=sqrt(kx^2+ky^2)：波的“空间频率”【波数模长/空间角频率】
 *        频率 ν = |k|/2π  |  ​波长 λ = 2π/|k|
 * 一个平面波最自然的写法是复指数：e^i(kx​·x+ky·​y) => 让频谱满足共轭对称 每一对±k合在一起 => 等价于一个实数的 cosine 波
 * 
 * ==============================================================================================================
 * 
 * 分形维数对应的斜率通常来自：
 *        功率谱密度PSD的幂律：logS(k) - logk 的斜率
 *        结构函数/变差函数：log{[z(x+r)-z(x)]^2} - logr
 * 
 * 因为每个波数模长k的幅值（傅里叶系数幅值 并非物理幅值）：A(k) ∝ k^[-(H+1)]
 * => 功率（幅值平方）满足：S(k) ∝ |A(k)|^2 ∝ k^[-2(H+1)]
 * 
 * ==============================================================================================================
 * 
 * ✨【长波(大尺度起伏)&短波(小尺度粗糙)按一个幂律比例分配能量 + 每个波一个随机相位 + 全部叠加 => 具有目标分形维数的粗糙面】
 * 
 * ==============================================================================================================
 */

// ===== RNGs 随机数发生器部分 =====
//【经典线性同余随机数发生器 LCG】
class ParkMiller {
  constructor(s = 1) {
    this.m = 2147483647;
    this.a = 16807;
    // 种子规整到1~m-1 避免0导致死循环
    this.state = (Math.abs(Math.floor(s)) % (this.m - 1)) + 1;
  };
  next() {
    this.state = (this.a * this.state) % this.m;
    // 得到 (0,1) 的近似均匀分布 | 0~1区间双精度浮点数
    return this.state / this.m;
  };
};
//【在 ParkMiller 上叠加一个 Bays-Durham shuffle，减弱低维相关】
class BaysDurham {
  constructor(s = 1, n = 32) {
    this.pm = new ParkMiller(s);
    this.n = n;
    this.tab = Array.from({ length: n }, () => this.pm.next());
  };
  next() {
    // 降低低维相关
    const j = Math.floor(this.pm.next() * this.n);
    const r = this.tab[j];
    this.tab[j] = this.pm.next();
    return r;
  };
};
//【L’Ecuyer 组合乘同余生成器】
class Lecuyer {
  constructor(s = 1) {
    this.IM1 = 2147483563;
    this.IM2 = 2147483399;
    this.AM = 1 / this.IM1;
    this.IA1 = 40014;
    this.IA2 = 40692;
    this.IQ1 = 53668;
    this.IQ2 = 52774;
    this.IR1 = 12211;
    this.IR2 = 3791;
    this.NTAB = 32;
    this.NDIV = Math.floor((this.IM1 - 1) / this.NTAB);
    this.EPS = 1.2e-7;
    this.RNMX = 1.0 - this.EPS;
    let id = Math.abs(Math.floor(s)) + 1;
    this.idum2 = 123456789;
    this.iy = 0;
    this.iv = new Array(this.NTAB).fill(0);
    for (let j = this.NTAB + 7; j >= 0; j--) {
      let k = Math.floor(id / this.IQ1);
      let id = this.IA1 * (id - k * this.IQ1) - k * this.IR1;
      if (id < 0) id += this.IM1;
      if (j < this.NTAB) this.iv[j] = id;
    };
    this.iy = this.iv[0];
    this.idum = id;
  };
  next() {
    let k = Math.floor(this.idum / this.IQ1);
    this.idum = this.IA1 * (this.idum - k * this.IQ1) - k * this.IR1;
    if (this.idum < 0) this.idum += this.IM1;
    let k2 = Math.floor(this.idum2 / this.IQ2);
    this.idum2 = this.IA2 * (this.idum2 - k2 * this.IQ2) - k2 * this.IR2;
    if (this.idum2 < 0) this.idum2 += this.IM2;
    const j = Math.floor(this.iy / this.NDIV);
    this.iy = this.iv[j] - this.idum2;
    this.iv[j] = this.idum;
    if (this.iy < 1) this.iy += this.IM1 - 1;
    let t = this.AM * this.iy;
    return t > this.RNMX ? this.RNMX : t;
  };
};
// 把字符串映射到具体 RNG 类。后续生成表面时用它来给 phi 提供随机性
function makeRNG(kind, seed) {
  switch ((kind || "parkmiller").toLowerCase()) {
    case "parkmiller":
      return new ParkMiller(seed);
    case "bays-durham":
    case "baysdurham":
      return new BaysDurham(seed);
    case "l'ecuyer":
    case "lecuyer":
      return new Lecuyer(seed);
    default:
      return new ParkMiller(seed);
  };
};

// ===== utils 工具函数 =====
// 创建 ny × nx 的二维数组，填充初始值 v
const create2D = (ny, nx, v = 0) => Array.from({ length: ny }, () => new Array(nx).fill(v));
// 构造一个长度为 n 的一维数组：[0,1,2,...,h | h+1-n,...,-1] || 自然频率排序：前半段非负频率，后半段对应负频率
const lin = (n, s) => {
  const a = new Array(n);
  const h = Math.floor(n / 2);
  for (let i = 0; i < n; i++) a[i] = (i <= h ? i : i - n) * s;
  return a;
};

// 对波数向量 (kx, ky) 先旋转，再按各向异性拉伸，再求平方模
//  /xr\ = /cosθ   sinθ\ /kx\
//  \yr/   \-sinθ  cosθ/ \ky/
function rotk2(kx, ky, th, ax, ay) {
  const c = Math.cos(th);
  const s = Math.sin(th);
  const xr = c * kx + s * ky;
  const yr = -s * kx + c * ky;
  // 各向异性拉伸 等价于在 k 空间用椭圆度量 | 如：ax>1 让x方向有效波数变小 偏低频 空间里x方向相关长度更长
  const xa = xr / ax;
  const ya = yr / ay;
  return xa * xa + ya * ya;
};
// 让频谱满足厄米共轭对称 => 纯实数高度场 z(x,y)
function enforceHermitian(Re, Im) {
  const ny = Re.length, nx = Re[0].length;
  // 对每个 (i,j) 计算对称点 (ii, jj) = (-i mod nx, -j mod ny) | 把对称点的实部设置为原点的实部，虚部取相反数
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const jj = (ny - j) % ny, ii = (nx - i) % nx;
      if (j > 0 || i > 0) {
        Re[jj][ii] = Re[j][i];
        Im[jj][ii] = -Im[j][i];
      }
    }
  }
  Re[0][0] = 0;
  Im[0][0] = 0; // 零均值
}
// 为了输出高度场的落差符合输入值，均值 0
function rescale(z, targetStd) {
  const nx = z[0].length;
  const ny = z.length;
  let s = 0; // 求和s
  let s2 = 0; // 求平方和s2
  let n = nx * ny; // 二维网格总数
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      s += z[j][i]; 
      s2 += z[j][i] * z[j][i];
    };
  };
  const m = s / n; // 均值
  const sd = Math.sqrt(Math.max(1e-20, s2 / n - m * m)); // 标准差
  const r = targetStd / (sd || 1);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      z[j][i] = (z[j][i] - m) * r;
    };
  };
  return z;
};

// ===== radix-2 FFT/IFFT 标准的基 2 FFT 实现【把 “随机频谱” 变成 “空间高度场” 】 ===== 
function bitrev(n) { // 输入 n 必须是 2 的幂
  const r = new Array(n);
  const b = Math.log2(n) | 0; // 如：n=8 => b=3 | n=32 => n=5
  for (let i = 0; i < n; i++) {
    let x = i, y = 0;
    for (let k = 0; k < b; k++) {
      y = (y << 1) | (x & 1);
      x >>= 1;
    };
    r[i] = y; // 如：i=3(011) => 6(110) 比特反转重排
  };
  return r; // 返回索引表 | Array(n)
};
// 一维复数 FFT / IFFT
function fft1d(re, im, inv = false) {
  // 用 re[]、im[] 表示复序列 : x[n] = re[n] + im[n]·i
  const n = re.length;
  const rev = bitrev(n);
  for (let i = 0; i < n; i++) {
    const j = rev[i];
    if (j > i) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    };
  };
  // 分级蝶形：len 从 2 到 n 每次翻倍
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inv ? -2 : 2) * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let ur = 1, ui = 0;
      for (let j = 0; j < len >> 1; j++) {
        const ar = re[i + j];
        const ai = im[i + j];
        const br = re[i + j + (len >> 1)] * ur - im[i + j + (len >> 1)] * ui;
        const bi = re[i + j + (len >> 1)] * ui + im[i + j + (len >> 1)] * ur;
        re[i + j] = ar + br;
        im[i + j] = ai + bi;
        re[i + j + (len >> 1)] = ar - br;
        im[i + j + (len >> 1)] = ai - bi;
        const tr = ur * wr - ui * wi;
        ui = ur * wi + ui * wr;
        ur = tr;
      };
    };
  };
  if (inv) {
    for (let i = 0; i < n; i++) {
      re[i] /= n;
      im[i] /= n;
    };
  };
};
// 二维 IFFT（先行后列）
function ifft2(Re, Im) {
  const ny = Re.length, nx = Re[0].length;
  const tRe = create2D(ny, nx), tIm = create2D(ny, nx);
  for (let j = 0; j < ny; j++) {
    const re = Re[j].slice(), im = Im[j].slice();
    fft1d(re, im, true);
    for (let i = 0; i < nx; i++) {
      tRe[j][i] = re[i];
      tIm[j][i] = im[i];
    };
  };
  const z = create2D(ny, nx),
    reCol = new Array(ny),
    imCol = new Array(ny);
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      reCol[j] = tRe[j][i];
      imCol[j] = tIm[j][i];
    };
    fft1d(reCol, imCol, true);
    for (let j = 0; j < ny; j++) z[j][i] = reCol[j];
  };
  return z;
};

// =====【单面 SRM 生成：在频域构造一个具有目标功率谱的随机场】=====
function makeSpectrumSingle(nx, ny, Lx, Ly, H, ax, ay, thetaDeg, rng) {
  const th = (thetaDeg * Math.PI) / 180;
  const dkx = (2 * Math.PI) / Lx, dky = (2 * Math.PI) / Ly;
  const kx = lin(nx, dkx), ky = lin(ny, dky);
  const Re = create2D(ny, nx), Im = create2D(ny, nx);
  const alpha = H + 1; // 振幅 ~ k^{-(H+1)} = k^{-(4-D)}
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const k2 = rotk2(kx[i], ky[j], th, ax, ay);
      if (k2 < 1e-30) continue; // 跳过 DC
      const k = Math.sqrt(k2);
      const amp = Math.pow(k, -alpha);
      const phi = 2 * Math.PI * (rng ? rng.next() : Math.random()); // 相位随机
      Re[j][i] = amp * Math.cos(phi);
      Im[j][i] = amp * Math.sin(phi);
    };
  };
  enforceHermitian(Re, Im);
  return { Re, Im };
};

// 主函数：generateSurface
/**
 * 生成单张自仿射粗糙表面【经典 SRM】
 * @param {Object} opts
 *  - nx, ny: 离散网格数
 *  - L: 物理尺寸（正方域） | 即网格间距：Δx=L/nx
 *  - D: 分形维数 (2~3)
 *  - sigma: 目标 RMS 高度 | max-min
 *  - anisotropy: X/Y 各向异性（ax = anisotropy, ay = 1）
 *  - thetaDeg: 旋转角（度）；若无需角度，设为 0
 *  - rngKind: "parkmiller" | "baysdurham" | "lecuyer"
 *  - seed: 随机种子
 * @returns {{ Z: number[][], meta: Object }}
 */
export function generateSurface({
  nx = 512,
  ny = 512,
  L = 0.1,
  D = 2.1,
  sigma = 0.01,
  anisotropy = 1.0,
  thetaDeg = 0,
  rngKind = "parkmiller",
  seed = 799753397,
} = {}) {
  const H = 3 - D;
  const ax = anisotropy, ay = 1.0; // 各向异性参数：ax = anisotropy，ay 固定 1
  const Lx = L, Ly = L; // 正方形域
  const rng = makeRNG(rngKind, seed);
  // 调用 makeSpectrumSingle：在频域生成带有分形谱的复数场 (Re, Im)
  const { Re, Im } = makeSpectrumSingle(
    nx,
    ny,
    Lx,
    Ly,
    H,
    ax,
    ay,
    thetaDeg,
    rng
  );
  let Z = ifft2(Re, Im);
  Z = rescale(Z, sigma);

  return {
    Z,
    meta: { nx, ny, L, D, H, sigma, anisotropy, thetaDeg, rngKind, seed },
  };
};