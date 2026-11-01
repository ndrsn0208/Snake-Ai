<div align="center">

![Snake AI — Fast replay, headless training](docs/assets/cover.png)

**Watch a neural-network Snake agent at your own speed. Train without a game window.**

[Try the demo](#gameplay-replay) · [Headless training](#headless-training) · [Original Python](game_old.py)

</div>

![The same gameplay replay at 1×, 4×, and 16× speed](docs/assets/gameplay.gif)

## Gameplay replay

Open **[`demo/index.html`](demo/index.html)** in a modern browser. No install or build is required.

Or use Node.js 20+ for a local preview:

```sh
npm run preview
```

Open **http://127.0.0.1:4174**. The server listens only on your computer and serves only the demo assets.

- **Default 4× playback:** 60 moves per second, compared with the original `game.py` rate of 15.
- **0.5× / 1× / 2× / 4× / 8× / 16×:** change speed instantly without restarting the game.
- **Pause, replay, step, and seek:** inspect any moment.
- **Next food:** skip directly to the next food event, or the finish when none remain.
- **AI inspector:** see the nine input signals, three output activations, and selected action.
- **New run:** generate another deterministic game using the same trained policy.

The replay is computed before playback. Its clock advances by elapsed time, not by counting rendered frames. At high speed a frame can advance several moves, so playback is not capped at the display's refresh rate. Changing speed affects timing only; it cannot change the result.

Output activations are independent sigmoid values, not probabilities. The highest activation selects left, right, or straight.

## Headless training

The original `test.py` trains by creating and rendering one Pygame game after another. Each simulation step waits for the display clock, so learning is limited by playback.

The new trainer runs directly in memory:

```sh
npm run train
```

It evaluates a population without Pygame, a display, or frame-rate waits, then writes `demo/policy.js`. Refresh the demo to use the resulting model. Training speed and replay speed are independent.

**One measured local run:** 11,520 games and 9,980,917 simulated moves in **15.54 seconds**. Runtime varies by machine.

The bundled policy uses the **9 → 16 → 3** network architecture from the original training entry point. It was newly evolved; there were no saved trained weights in the 2019 repository. Its training procedure is explicit and reproducible:

- Seed: `20190721`
- Population: 64, for 60 generations
- Initialization: a documented food-seeking and collision-avoidance heuristic encoded as network weights
- Evolution: selection, crossover, and Gaussian mutation
- Training seeds: 31, 137, 911
- Separate validation seeds: 7, 2026, 8675309, 410, 709

The validation runs are stored in the policy metadata and verified by tests. This is a small reactive network: it can collect food effectively but still traps itself. The replay shows actual outcomes, including collisions.

## What is preserved

All seven original Python files remain unchanged. `test.py` used `game_old.py` with the 9 → 16 → 3 network and a 90 Hz display limit; the separate `game.py` prototype used 9 → 18 → 7 → 3 and a 15 Hz limit.

The browser companion uses the training entry point's architecture and input ordering. Its simulator corrects invalid initial body placement, keeps food inside the board and off the snake, handles a full board, and permits moving into a vacated tail cell. It is a corrected environment, not a byte-for-byte replay of the original Pygame bugs.

## Verify

The normal checks have no external dependencies:

```sh
npm test
npm run check
```

Tests cover deterministic games, collision and growth rules, food events, reproducible validation results, NumPy network-reference fixtures, and playback behavior at different speeds and rendering frame rates.

To compare the JavaScript forward pass with the original `network.py`, using Python with NumPy installed:

```sh
npm run verify:network
```

Set `SNAKE_PYTHON` to choose a specific Python executable.

## Layout

```text
*.py                    Original Pygame / NumPy experiment
demo/engine.js          Headless game and neural-network inference
demo/playback.js        Frame-rate-independent replay clock
demo/renderer.js        Shared board renderer
demo/policy.js          Newly evolved model and training metadata
demo/app.js             Replay controls and AI inspector
scripts/train.cjs      Reproducible headless evolution
tests/                  Engine, network, and timing checks
```

The interface uses English, readable text, and cyan/orange visuals. Reduced-motion mode keeps accurate timing while disabling movement interpolation.
