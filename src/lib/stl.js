export function gridToSTL(z, Lx, Ly, name = "surface") {
  const ny = z.length,
    nx = z[0].length;
  const dx = Lx / (nx - 1),
    dy = Ly / (ny - 1);
  const lines = [`solid ${name}`];
  const tri = (p1, p2, p3) => {
    const ux = p2[0] - p1[0],
      uy = p2[1] - p1[1],
      uz = p2[2] - p1[2];
    const vx = p3[0] - p1[0],
      vy = p3[1] - p1[1],
      vz = p3[2] - p1[2];
    const nx = uy * vz - uz * vy,
      ny = uz * vx - ux * vz,
      nz = ux * vy - uy * vx;
    lines.push(`  facet normal ${nx} ${ny} ${nz}`);
    lines.push(`    outer loop`);
    lines.push(`      vertex ${p1[0]} ${p1[1]} ${p1[2]}`);
    lines.push(`      vertex ${p2[0]} ${p2[1]} ${p2[2]}`);
    lines.push(`      vertex ${p3[0]} ${p3[1]} ${p3[2]}`);
    lines.push(`    endloop`);
    lines.push(`  endfacet`);
  };
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const x0 = i * dx - Lx / 2,
        x1 = (i + 1) * dx - Lx / 2;
      const y0 = j * dy - Ly / 2,
        y1 = (j + 1) * dy - Ly / 2;
      const p00 = [x0, y0, z[j][i]],
        p10 = [x1, y0, z[j][i + 1]];
      const p01 = [x0, y1, z[j + 1][i]],
        p11 = [x1, y1, z[j + 1][i + 1]];
      tri(p00, p10, p11);
      tri(p00, p11, p01);
    }
  }
  lines.push(`endsolid ${name}`);
  return new Blob([lines.join("\n")], { type: "model/stl" });
}
