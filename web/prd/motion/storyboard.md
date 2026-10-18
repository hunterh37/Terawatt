# Storyboard: Rack to the Future in one zoom

File: `prd/motion/index.html`. A looping animation, standalone (HTML, CSS, inline SVG, vanilla JS, no libraries).
Total run time per loop: 42 seconds. Each beat below lists its start, end and duration in seconds.

Rules for every beat:
- The camera pulls back. The incoming scene starts larger and settles to full size. The outgoing scene shrinks as it fades.
- Cross-fade overlap between beats: 0.6 seconds, taken from the end of the outgoing beat (the incoming beat starts fading in 0.6 s before its listed start). The last beat fades into the first, so the loop has no hard cut.
- Transform and opacity do most of the moving. A few SVG attributes animate too: dot and rack-square positions (`cx`, `cy`, `y`), the globe's meridian width (`rx`), the gauge bar's width and colour (`width`, `fill`), the price axis draw-on (`stroke-dashoffset`) and the break-even pulse (`r`). Easing is a cubic ease-out.
- Numbers on screen come from the engine outputs for the start-preset family at build time, or from the sources list. Each is shown with its source id in the caption under the animation. The app itself reads live metrics.
- Geometry is schematic, not to scale.
- With `prefers-reduced-motion: reduce`, nothing animates. The page shows the written storyboard and opens a set of static frames, one per beat, drawn in their final state.

| # | Beat | Start (s) | End (s) | Duration (s) | Zoom level lit | What is on screen | Numbers and source ids |
|---|---|---|---|---|---|---|---|
| 1 | Chip | 0 | 4 | 4 | Chip | A package with four GPU dies in the middle and four HBM stacks at the sides. The heat lens warms the dies from blue-grey to red. Power dots flow in from a power block. | 4 GPU dies and 4 HBM stacks (s28.dies) |
| 2 | Rack | 4 | 8 | 4 | Rack | A cabinet rises from the table line. Nine compute trays, a power shelf, a liquid manifold with coolant dots. Labels fade in after the rise. | 792 kW and 144 chips (s12.racks) |
| 3 | Hall | 8 | 12 | 4 | Hall | A grid of racks appears one by one, orange for prefill and blue for decode, with cold and hot aisle labels, cooling units on one wall and a busway overhead. | 64 racks (a.hall_racks) |
| 4 | Building | 12 | 16 | 4 | Building | Hall blocks in a grid under a cutaway roof. The roof lifts away. A substation and a cooling plant sit outside, joined by lines. | PUE 1.07 cold climate and 1.14 desert, direct liquid cooling (s15.pue) |
| 5 | Site | 16 | 20 | 4 | Site | A terrain plate. A ghost building grows from the ground, with a substation on a grid line and a cooling plant. A dashed nearby campus sits at the edge. | West Texas 45 ms round trip (s13.rtt) |
| 6 | Earth fleet | 20 | 24 | 4 | Earth fleet | A slowly turning globe. Six site pillars grow. A green ring at the base is the grid gauge. | 500 MW grid cap in the caption (s9.setting) |
| 7 | Grid gauge | 24 | 30 | 6 | Earth fleet | A horizontal 500 MW gauge fills green, then amber, then red. The bar spills past the cap and is cut off at the screen edge. Five rack squares detach and lift upward with a "to orbit" arrow. | 500 MW cap (s9.setting); 1,554 MW for all of Case B on Earth (d.facility); 1,790 racks (d.capacity); 50M developers (s11.cases) |
| 8 | Orbit | 30 | 35 | 5 | Off-world | The Earth limb at the bottom, a dashed low Earth orbit ring above it. Rack squares rise to three satellites. Solar wings (yellow) and radiator wings (blue) unfold. The Moon and Mars sit far away on dashed links. | 499 MW in orbit in the "LPUs on Earth, overflow to orbit" preset (d.placement); 40 ms LEO, 2.6 s Moon, 25 min Mars round trip (s13.rtt); 1,080 m2 of radiator and 18 t per MW (s15.orbit) |
| 9 | Break-even price | 35 | 42 | 7 | Off-world (the progress bar stays on the last level) | A large "$34.45". A price line draws left to right. Markers drop in for the $20 plans, the "from $100" plans and the break-even point, which pulses at the end. | $34.45 per user per month (a.breakeven); $20 and from $100 plans (ext.sub_price) |

Beat durations add up to 42 seconds: 4 + 4 + 4 + 4 + 4 + 4 + 6 + 5 + 7.

## Controls

- Pause or Play, Restart, and a timeline slider that scrubs to any moment (scrubbing pauses).
- Links at the top return to the PRD (`../index.html`) and to the app (`../../index.html`).

## Notes for the editor

- The break-even scale on beat 9 is not labelled with a numeric axis. Marker positions are linear in price; the axis range is a layout choice.
- The gauge on beat 7 is cut off on purpose. The overflow is far longer than the screen, so the bar carries a tear mark and the label says "schematic, not to scale".
- Beats 1 to 6 follow the zoom ladder (chip, rack, hall, building, site, Earth fleet). Beat 8 is the off-world level.
- If a number in the engine changes, update the matching caption in `index.html` (the `BEATS` array and the written list) and this table together.
