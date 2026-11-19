/**
 * Scalar clamp, lerp, smoothstep and exponential damping helpers.
 */
export const clamp = (r, t, e) => (r < t ? t : r > e ? e : r);
export const lerp2 = (r, t, e) => r + (t - r) * e;
export const smoothstep2 = (r, t, e) => {
  const i = clamp((e - r) / (t - r), 0, 1);
  return i * i * (3 - 2 * i);
};
export const damp = (r, t, e, i) => lerp2(r, t, 1 - Math.exp(-e * i));
