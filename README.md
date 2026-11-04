# Cabinet Designer

Design plywood furniture in the browser. Draw, cut, drill — get drawings and a cutting map.

![Kitchen project with drawers open](docs/kitchen.png)

## Tools

- SketchUp-like 3D modelling — push/pull, move, rotate, tape, snaps
- Parametric furniture — wardrobe, kitchen, dresser, shelf, bedside, table
- Holes, slots, rounded cut-outs, dowel joints into the next board
- Hinges, slides, brackets — doors and drawers open with soft-close
- Photoreal render on your GPU
- Drawings, milling map, cutting map, PDF sheet
- Export: DXF, SVG, OBJ, DAE, CSV · import: DAE, OBJ, FBX, GLB, STL

![Wardrobe](docs/wardrobe.png)

![Drawings](docs/drawings.png)

## Run locally

```bash
git clone https://github.com/NRux/cnc-cabinet-designer.git && cd cnc-cabinet-designer
python3 -m http.server 8080
```

The site runs without a build step. Its pinned JavaScript dependencies are committed under `vendor/`, so it does not load executable code from a CDN at runtime.

To update dependencies or the inline application script, run:

```bash
npm ci
npm run vendor
npm run csp:update
npm test
```

`csp:update` refreshes the Content Security Policy hashes after changes to the inline module or import map.

## Support

- Solana: `64kwY5adPeQVfzvsyvEpke5wsJuVEPXAY3bm6VuFBZf`
- Ethereum: `0xad4a06e063d0e83e783f9fb17efc6524a83a40f2`
- USDT TRC20: `TERWLLYABDAvMQTKPkpXwdKpU4AS5k8ff3`

## License

All rights reserved. Third-party: three.js, three-mesh-bvh, three-gpu-pathtracer, three-bvh-csg (MIT).
