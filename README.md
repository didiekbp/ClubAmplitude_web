# Club Amplitude – TP modélisation sismique (web version)

Web rebuild of the Club Amplitude Java applets shown in *Solution_TP_Modélisation_Club_Amplitude.ppt*.
Backend: Python (FastAPI + NumPy). Frontend: plain JavaScript and canvas, no build step, no external libraries.

## Run

```bash
pip install -r requirements.txt
uvicorn backend.app:app --reload        # from the project root
```

Open http://localhost:8000. Python 3.9 or later.

Run unit tests:
```bash
pytest tests
```

## Layout

```
backend/physics.py   Gassmann, Wood, Zoeppritz, Ricker, synthetic gathers, offsets
backend/app.py       REST API + static file serving
frontend/index.html  UI (two tabs)
frontend/app.js      Forms, API calls, canvas plots
```

## Tab 1 – Fluids and AVO (slides 2–3, 5–6, 8–9)

Units: ρ in g/cc, V in m/s, moduli in GPa.

| Step | Formula |
|---|---|
| Fluid bulk modulus | K = ρ·V² / 10⁶ |
| Fluid mix (Wood) | 1/K_f = Sw/K_w + (1−Sw)/K_hc ; ρ_f = Sw·ρ_w + (1−Sw)·ρ_hc |
| Rock shear modulus | G = ρ·Vs² (unchanged by fluid) |
| Dry frame (inverted Gassmann) | K_d = [K_sat(φK_m/K_f + 1 − φ) − K_m] / [φK_m/K_f + K_sat/K_m − 1 − φ] |
| Gassmann | K_sat = K_d + (1 − K_d/K_m)² / (φ/K_f + (1−φ)/K_m − K_d/K_m²) |
| New density | ρ₂ = ρ₁ − φ·ρ_f1 + φ·ρ_f2 |
| Velocities | Vp = √((K_sat + 4G/3)/ρ), Vs = √(G/ρ) |

Three states are computed for the lower layer: initial, modeled (fluid replaced) and Sw = 100 %.
Each is compared with the shale above using the exact P-P Zoeppritz equations (Aki & Richards form).
By default, the real part is plotted to reproduce the historical Java applet slides; a **Modulus |R|**
toggle is available to view the physically complete total-reflection magnitude.
R10 and R30 are the signed P-wave reflection coefficients at 10° and 30° incidence, respectively.
They are dimensionless: for example, −0.176 means a reflected amplitude 17.6% of the incident amplitude
with reversed polarity. The crossplot places R30 against R10 to compactly compare near-angle reflectivity
with its change at a wider angle for the initial, modeled, and fully water-saturated cases. Its dashed
$R_{30} = R_{10}$ diagonal marks equal coefficients at both angles; points away from it indicate
angle-dependent reflectivity. Interpret coefficient signs when comparing amplitudes. These two samples
summarize the full reflectivity-versus-angle curves but do not replace them.

The tab presents the initial and modeled fluids and rocks side by side. Edit the initial rock and fluid
properties on the left and the modeled fluid properties on the right; the modeled rock properties update
from the fluid-substitution calculation. Water properties are shared between the two fluids. The reference
upper shale properties can be expanded below the comparison panels. Modeled porosity is independently
editable; the app retains the dry-frame modulus inferred from the initial rock and recalculates the modeled
rock properties at the entered porosity.

## Tab 2 – Layered model (slides 4, 7, 10–12)

- Facies types and the impedance/angle-gather plots are arranged side by side. Choose a facies and use
  **Add layer** to append it to the stack. Select a model layer above the plots to change its facies or
  thickness, or move/delete it. Facies values (name, colour, ρ, Vp, Vs) are editable in the left panel,
  with a form for adding custom types. A facies cannot be deleted while a model layer uses it.
- The **Scale** tab controls the displayed maximum time window (ms), gain, and the layer log: P impedance
  (Ip = ρVp), S impedance (Is = ρVs), or Vp/Vs. **Wavelet** controls Ricker frequency and phase rotation
  (0° is zero phase), displays the active wavelet, and optionally imports ASCII samples. Import either
  one amplitude per line (1 ms sampling) or two columns of time in ms and amplitude; two-column data is
  resampled to 1 ms. The imported wavelet replaces the generated Ricker, and phase rotation still applies.
- Two-way time per layer: TWT = 2h / Vp.
- Angle gathers (0–50°, 5° step): at each interface the Zoeppritz reflectivity for each angle is placed at
  the interface time, then convolved with a Ricker wavelet (default 30 Hz; configurable phase rotation).
  The same angle is used at every interface (constant-angle gathers).
- The synthetic gather uses depth (m) on the left vertical axis with regular metre intervals and time
  (ms) on the right. Depth tick positions reflect the conversion through the configured overburden and
  model-layer P-wave velocities. Wiggle amplitudes are clipped to their trace spacing so adjacent traces
  remain legible.
- Click a layer interval in the impedance log or angle gather to select it. The selected layer's AVO panel
  plots amplitudes extracted from the convolved angle gathers at its top and base interface times; hover
  over an angle to read both signed amplitudes. Its axes are labeled Angle (°) and Gather amplitude.
  The first layer has no top interface and the last layer has no base interface. The default stack
  contains five layers.
- Overburden ("Mort-terrain", slide 12): thickness and Vp per layer. It shifts the gather time axis by
  overburden two-way time, contributes to the depth axis, and displays a model-top angle-to-offset table.
  With p = sin(θ) / Vp,top, offset = 2 Σ hᵢ·p·Vᵢ / √(1 − (p·Vᵢ)²); critical angles show "–".
- "Envoyer au modèle en couches" on tab 1 loads the four facies computed there (shale, gas, oil, wet sand).

## API

| Endpoint | Purpose |
|---|---|
| `GET /api/minerals` | Mineral list (quartz, calcite, dolomite, clay) |
| `POST /api/fluid` | Fluid substitution + AVO curves, R10/R30 |
| `POST /api/model` | Angle gathers, layer tops, Ip, overburden time shift and angle-to-offset table; optional 1 ms wavelet samples |

Interactive docs: http://localhost:8000/docs

The mineral bulk and shear moduli and densities in `backend/physics.py` are representative, rounded rock-physics
handbook values. They are starting assumptions rather than universal constants; actual values can vary with
mineral composition and conditions. The clay entry is an effective representative value, since natural clays
vary particularly widely. Edit `MINERALS` in `backend/physics.py` to change the defaults.

## References

- Mavko, G., Mukerji, T. & Dvorkin, J. (2009). *The Rock Physics Handbook: Tools for Seismic Analysis of
  Porous Media*, 2nd ed. Cambridge University Press. [https://doi.org/10.1017/CBO9780511626753](https://doi.org/10.1017/CBO9780511626753).
