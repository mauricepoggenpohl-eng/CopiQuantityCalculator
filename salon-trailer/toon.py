import numpy as np, cv2

class Toon:
    """GTA-artwork-like stylizer: edge-preserving smoothing, fixed palette (no flicker), ink lines."""
    def __init__(self, sample_frames, k=18):
        px = []
        for f in sample_frames:
            s = cv2.resize(f, (135, 240), interpolation=cv2.INTER_AREA)
            s = self._smooth(s, small=True)
            px.append(cv2.cvtColor(s, cv2.COLOR_RGB2LAB).reshape(-1, 3))
        px = np.concatenate(px).astype(np.float32)
        crit = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 50, 0.5)
        cv2.setRNGSeed(3)
        _, _, centers = cv2.kmeans(px, k, None, crit, 4, cv2.KMEANS_PP_CENTERS)
        self.pal = centers.astype(np.float32)

    def _smooth(self, a, small=False):
        n = 2 if small else 4
        for _ in range(n):
            a = cv2.bilateralFilter(a, 9, 40, 7)
        return a

    def __call__(self, frame, line=2, mix=0.7):
        h, w = frame.shape[:2]
        s = cv2.resize(frame, (w // 2, h // 2), interpolation=cv2.INTER_AREA)
        sm = self._smooth(s)
        lab = cv2.cvtColor(sm, cv2.COLOR_RGB2LAB).astype(np.float32)
        flat = lab.reshape(-1, 3)
        # nearest palette colour
        d = ((flat[:, None, :] - self.pal[None, :, :]) ** 2).sum(2)
        q = self.pal[d.argmin(1)].reshape(lab.shape)
        q = cv2.cvtColor(np.clip(q, 0, 255).astype(np.uint8), cv2.COLOR_LAB2RGB)
        q = cv2.medianBlur(q, 5)
        out = cv2.addWeighted(q, mix, sm, 1 - mix, 0)
        # punchy illustration colours
        hsv = cv2.cvtColor(out, cv2.COLOR_RGB2HSV).astype(np.float32)
        hsv[..., 1] = np.clip(hsv[..., 1] * 1.0, 0, 255)
        hsv[..., 2] = np.clip((hsv[..., 2] - 128) * 1.15 + 132, 0, 255)
        out = cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2RGB)
        # ink lines
        g = cv2.cvtColor(sm, cv2.COLOR_RGB2GRAY)
        g = cv2.medianBlur(g, 5)
        e = cv2.adaptiveThreshold(g, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY, 9, 4)
        e = 255 - e
        e = cv2.morphologyEx(e, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
        if line > 1:
            e = cv2.dilate(e, np.ones((line, line), np.uint8))
        out = cv2.resize(out, (w, h), interpolation=cv2.INTER_CUBIC)
        e = cv2.resize(e, (w, h), interpolation=cv2.INTER_LINEAR).astype(np.float32)[..., None] / 255
        ink = np.array([20, 8, 28], np.float32)
        out = out.astype(np.float32) * (1 - e * 0.9) + ink * e * 0.9
        return np.clip(out, 0, 255).astype(np.uint8)


def game_look(frame):
    """Real-time-render look: smooth 'shader' surfaces, crisp detail, bloom, slight CA."""
    h, w = frame.shape[:2]
    s = cv2.resize(frame, (w // 2, h // 2), interpolation=cv2.INTER_AREA)
    for _ in range(3):
        s = cv2.bilateralFilter(s, 9, 28, 9)
    s = cv2.resize(s, (w, h), interpolation=cv2.INTER_CUBIC)
    blur = cv2.GaussianBlur(s, (0, 0), 3)
    s = cv2.addWeighted(s, 1.8, blur, -0.8, 0)              # crisp 'texture' sharpening
    f = s.astype(np.float32)
    lum = f.mean(2, keepdims=True)
    hi = np.clip((lum - 170) / 85, 0, 1) * f
    bloom = cv2.GaussianBlur(hi, (0, 0), 25)
    f = f + bloom * 0.55
    f = (f - 128) * 1.08 + 128
    out = np.clip(f, 0, 255).astype(np.uint8)
    # tiny chromatic aberration at edges
    out[..., 0] = np.roll(out[..., 0], 2, axis=1)
    out[..., 2] = np.roll(out[..., 2], -2, axis=1)
    return out
