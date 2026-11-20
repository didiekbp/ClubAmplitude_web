"""Rock physics and AVO forward modeling (units: g/cc, m/s, GPa)."""
import numpy as np

MINERALS = {  # K (GPa), G (GPa), rho (g/cc)
    "quartz": (37.0, 44.0, 2.65), "calcite": (76.8, 32.0, 2.71),
    "dolomite": (94.9, 45.0, 2.87), "clay": (21.0, 7.0, 2.60)}

def bulk(rho, vp):                      # fluid bulk modulus, GPa
    return rho * vp**2 / 1e6

def mix_fluid(sw, vw, rw, vh, rh):
    """Wood's law for K, arithmetic average for density."""
    kw, kh = bulk(rw, vw), bulk(rh, vh)
    return 1 / (sw / kw + (1 - sw) / kh), sw * rw + (1 - sw) * rh

def props(rho, vp, vs):
    return dict(rho=rho, vp=vp, vs=vs, ip=rho * vp,
                pr=(vp**2 - 2 * vs**2) / (2 * (vp**2 - vs**2)))

def gassmann(vp, vs, phi, mineral, f1, f2, target_phi=None):
    """Substitute fluid and optionally porosity, retaining the inferred dry-frame modulus."""
    km, _, rm = MINERALS[mineral]
    target_phi = phi if target_phi is None else target_phi
    kf1, rf1 = f1
    kf2, rf2 = f2
    rho1 = rm * (1 - phi) + rf1 * phi
    g = rho1 * (vs / 1000) ** 2
    ksat1 = rho1 * (vp / 1000) ** 2 - 4 * g / 3
    denom_kd = (phi * km / kf1 + ksat1 / km - 1 - phi)
    kd = (ksat1 * (phi * km / kf1 + 1 - phi) - km) / denom_kd if abs(denom_kd) > 1e-12 else 0.0
    kd = max(0.0, kd)
    denom_sat2 = (target_phi / kf2 + (1 - target_phi) / km - kd / km**2)
    ksat2 = kd + (1 - kd / km) ** 2 / denom_sat2 if abs(denom_sat2) > 1e-12 else kd
    rho2 = max(0.01, rm * (1 - target_phi) + rf2 * target_phi)
    vp2 = float(1000 * np.sqrt(max(0.0, (ksat2 + 4 * g / 3) / rho2)))
    vs2 = float(1000 * np.sqrt(max(0.0, g / rho2)))
    return rho2, vp2, vs2

def zoeppritz_pp(m1, m2, theta_deg, return_complex=False):
    """Exact P-P reflection coefficient (Aki & Richards); m=(rho,vp,vs)."""
    r1, a1, b1 = m1; r2, a2, b2 = m2
    th = np.radians(np.asarray(theta_deg, float))
    p = np.sin(th) / a1
    c = lambda v: np.sqrt(1 - (p * v) ** 2 + 0j)
    ci1, ci2, cj1, cj2 = np.cos(th), c(a2), c(b1), c(b2)
    A = r2 * (1 - 2 * b2**2 * p**2) - r1 * (1 - 2 * b1**2 * p**2)
    B = r2 * (1 - 2 * b2**2 * p**2) + 2 * r1 * b1**2 * p**2
    C = r1 * (1 - 2 * b1**2 * p**2) + 2 * r2 * b2**2 * p**2
    D = 2 * (r2 * b2**2 - r1 * b1**2)
    E = B * ci1 / a1 + C * ci2 / a2
    F = B * cj1 / b1 + C * cj2 / b2
    G = A - D * ci1 / a1 * cj2 / b2
    H = A - D * ci2 / a2 * cj1 / b1
    den = E * F + G * H * p**2
    val = ((B * ci1 / a1 - C * ci2 / a2) * F - (A + D * ci1 / a1 * cj2 / b2) * H * p**2) / den
    return val if return_complex else np.real(val)

def ricker(f, dt):
    """Zero-phase Ricker wavelet with an odd number of samples, so the peak sits exactly on the centre sample."""
    nh = int(np.ceil(1.5 / f / dt))
    t = np.arange(-nh, nh + 1) * dt
    a = (np.pi * f * t) ** 2
    return (1 - 2 * a) * np.exp(-a)

def rotate_phase(wavelet, phase_deg):
    """Apply constant phase rotation using the discrete Hilbert transform."""
    n = len(wavelet)
    if not phase_deg:
        return wavelet
    spectrum = np.fft.fft(wavelet)
    multiplier = np.zeros(n)
    multiplier[0] = 1
    if n % 2 == 0:
        multiplier[n // 2] = 1
        multiplier[1:n // 2] = 2
    else:
        multiplier[1:(n + 1) // 2] = 2
    quadrature = np.fft.ifft(spectrum * multiplier).imag
    phase = np.radians(phase_deg)
    return wavelet * np.cos(phase) + quadrature * np.sin(phase)

def make_wavelet(f, dt=0.001, phase_deg=0.0, samples=None):
    """Generate a Ricker wavelet or phase-rotate validated imported samples."""
    if samples is None:
        wavelet = ricker(f, dt)
    else:
        wavelet = np.asarray(samples, float)
        if wavelet.ndim != 1 or not 3 <= len(wavelet) <= 4001 or len(wavelet) % 2 == 0:
            raise ValueError("Imported wavelet must contain an odd number of 3 to 4001 samples.")
        if not np.all(np.isfinite(wavelet)):
            raise ValueError("Imported wavelet samples must be finite.")
        if not np.any(wavelet):
            raise ValueError("Imported wavelet must contain a nonzero sample.")
    return rotate_phase(wavelet, phase_deg)

def synthetic(layers, angles, f=30.0, dt=0.001, tail=None, phase_deg=0.0, wavelet=None):
    """Angle gathers from a layer stack; layers=[(rho,vp,vs,thickness_m)]; times in s (TWT).
    Each spike is split linearly between its two neighbouring samples (no 1-sample jitter)."""
    tail = max(0.1, 1.5 / f) if tail is None else tail      # keep the full wavelet below the last interface
    twt = [2 * h / vp for _, vp, _, h in layers]
    tops = np.concatenate([[0], np.cumsum(twt)])
    n = int((tops[-1] + tail) / dt) + 2
    w = make_wavelet(f, dt, phase_deg, wavelet)
    nh = len(w) // 2
    traces = []
    for ang in angles:
        r = np.zeros(n)
        for k in range(len(layers) - 1):
            x = tops[k + 1] / dt
            i = int(np.floor(x)); fr = x - i
            v = float(zoeppritz_pp(layers[k][:3], layers[k + 1][:3], ang))
            r[i] += v * (1 - fr); r[i + 1] += v * fr
        traces.append(np.convolve(r, w)[nh: nh + n])
    return tops, np.arange(n) * dt, np.array(traces)

def offsets(overburden, angle_deg, target_vp=None):
    """Calculate model-top offsets and surface angles through the overburden."""
    if not overburden:
        return [None] * len(angle_deg), [None] * len(angle_deg)
    target_velocity = overburden[-1][1] if target_vp is None else target_vp
    offsets_m, surface_angles = [], []
    for angle in angle_deg:
        p = np.sin(np.radians(angle)) / target_velocity
        offset = 0.0
        critical = False
        for thickness, velocity in reversed(overburden):
            ray_sine = p * velocity
            if abs(ray_sine) >= 1:
                critical = True
                break
            offset += thickness * ray_sine / np.sqrt(1 - ray_sine**2)
        if critical:
            offsets_m.append(None)
            surface_angles.append(None)
            continue
        offsets_m.append(float(2 * offset))
        surface_angles.append(float(np.degrees(np.arcsin(p * overburden[0][1]))))
    return offsets_m, surface_angles
