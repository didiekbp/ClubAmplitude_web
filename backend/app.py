"""Club Amplitude TP – FastAPI backend. Run: uvicorn backend.app:app --reload  (from project root)"""
from pathlib import Path
from typing import Optional
import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from . import physics as ph

app = FastAPI(title="Club Amplitude – fluid substitution, AVO and 1D modeling")
ANGLES = np.arange(0, 61, 1.0)

class Fluid(BaseModel):
    sw: float = Field(0.25, ge=0.0, le=1.0)
    vw: float = Field(1520, gt=0)
    rw: float = Field(1.05, gt=0)
    vh: float = Field(1000, gt=0)
    rh: float = Field(0.8, gt=0)

class Layer(BaseModel):
    rho: float = Field(..., gt=0)
    vp: float = Field(..., gt=0)
    vs: float = Field(..., gt=0)

class FluidReq(BaseModel):
    mineral: str = "quartz"
    phi: float = Field(..., gt=0, lt=1.0)
    modeled_phi: Optional[float] = Field(None, gt=0, lt=1.0)
    vp: float = Field(..., gt=0)
    vs: float = Field(..., gt=0)
    initial: Fluid
    modeled: Fluid
    upper: Layer

@app.get("/api/minerals")
def minerals():
    return list(ph.MINERALS)

@app.post("/api/fluid")
def fluid(q: FluidReq):
    if q.mineral not in ph.MINERALS:
        raise HTTPException(status_code=400, detail=f"Unknown mineral: {q.mineral}")
    f0 = ph.mix_fluid(q.initial.sw, q.initial.vw, q.initial.rw, q.initial.vh, q.initial.rh)
    fm = ph.mix_fluid(q.modeled.sw, q.initial.vw, q.initial.rw, q.modeled.vh, q.modeled.rh)
    fw = ph.mix_fluid(1.0, q.initial.vw, q.initial.rw, q.modeled.vh, q.modeled.rh)
    rho0 = ph.MINERALS[q.mineral][2] * (1 - q.phi) + f0[1] * q.phi
    states = {"initial": (rho0, q.vp, q.vs)}
    modeled_phi = q.phi if q.modeled_phi is None else q.modeled_phi
    states["modeled"] = ph.gassmann(q.vp, q.vs, q.phi, q.mineral, f0, fm, target_phi=modeled_phi)
    states["wet"] = ph.gassmann(q.vp, q.vs, q.phi, q.mineral, f0, fw)
    up = (q.upper.rho, q.upper.vp, q.upper.vs)
    out = {"fluid_k": {"initial": f0[0], "modeled": fm[0]}, "angles": ANGLES.tolist(),
           "upper": ph.props(*up), "states": {}}
    for k, m in states.items():
        r = ph.zoeppritz_pp(up, m, np.r_[ANGLES, 10, 30], return_complex=True)
        r_real = np.real(r)
        r_abs = np.abs(r)
        out["states"][k] = {
            **ph.props(*map(float, m)),
            "r10": float(r_real[-2]),
            "r30": float(r_real[-1]),
            "curve": r_real[:-2].tolist(),
            "curve_abs": r_abs[:-2].tolist(),
        }
    return out

class Stack(BaseModel):
    facies: dict[str, Layer]
    layers: list[tuple[str, float]]            # (facies name, thickness m)
    overburden: list[tuple[float, float]] = []  # (thickness m, vp)
    freq: float = Field(30, ge=5, le=150)   # Hz
    phase: float = Field(0, ge=0, le=360)   # degrees
    wavelet: list[float] | None = None  # Odd-length samples at 1 ms
    max_angle: float = 50
    step: float = 5

@app.post("/api/model")
def model(q: Stack):
    if len(q.layers) < 2 or any(not np.isfinite(h) or h <= 0 for _, h in q.layers) or any(
        n not in q.facies for n, _ in q.layers
    ):
        raise HTTPException(422, 'Need at least 2 layers, each with a known facies and a positive thickness.')
    if any(not np.isfinite(h) or not np.isfinite(v) or h <= 0 or v <= 0 for h, v in q.overburden):
        raise HTTPException(422, 'Overburden thicknesses and velocities must be positive.')
    try:
        wavelet = ph.make_wavelet(q.freq, phase_deg=q.phase, samples=q.wavelet)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    lay = [(q.facies[n].rho, q.facies[n].vp, q.facies[n].vs, h) for n, h in q.layers]
    angles = np.arange(0, q.max_angle + 1e-9, q.step)
    tops, t, tr = ph.synthetic(lay, angles, q.freq, phase_deg=q.phase, wavelet=q.wavelet)
    offset, surface_angle = ph.offsets(q.overburden, angles.tolist(), target_vp=lay[0][1])
    t0 = sum(2 * h / v for h, v in q.overburden)
    return {"angles": angles.tolist(), "t": (t + t0).tolist(), "traces": tr.tolist(),
            "tops": (tops + t0).tolist(), "t0": t0,
            "depth_tops": np.cumsum([0] + [h for _, h in q.layers]).tolist(),
            "ip": [r * v for r, v, _, _ in lay],
            "offset": offset, "surface_angle": surface_angle,
            "wavelet": wavelet.tolist(),
            "wavelet_times": ((np.arange(len(wavelet)) - len(wavelet) // 2) * 0.001).tolist()}

app.mount("/", StaticFiles(directory=Path(__file__).parent.parent / "frontend", html=True), name="ui")
