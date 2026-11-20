"""
Say one line with Kokoro on this PC (master run §9 "a natural open-source voice").

    echo "Two minutes left." | .venv\\Scripts\\python speak.py --out clip.wav [--voice bf_emma] [--speed 1.0]

The words come on stdin (no shell quoting to go wrong). Prints one line of
JSON: {"seconds", "sample_rate", "bytes", "voice", "render_seconds"}.

Kokoro-82M (Apache 2.0) through kokoro-onnx; two model files, about 340 MB
together, fetched once by pc-worker/setup.ps1 into
%LOCALAPPDATA%\\Mycelium\\models\\kokoro (or MYCELIUM_KOKORO_DIR). Runs on the
processor through onnxruntime: a sentence renders in well under a second,
a briefing paragraph in a few. No paid service, nothing leaves the PC.
"""
import argparse
import json
import os
import sys
import time
from pathlib import Path


def model_dir() -> Path:
    env = os.environ.get("MYCELIUM_KOKORO_DIR")
    if env:
        return Path(env)
    base = os.environ.get("LOCALAPPDATA") or str(Path.home() / ".local" / "share")
    return Path(base) / "Mycelium" / "models" / "kokoro"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True)
    parser.add_argument("--voice", default="bf_emma")
    parser.add_argument("--speed", type=float, default=1.0)
    parser.add_argument("--lang", default="en-gb")
    args = parser.parse_args()

    text = sys.stdin.read().strip()
    if not text:
        print(json.dumps({"error": "nothing to say"}))
        return 2
    folder = model_dir()
    model = folder / "kokoro-v1.0.onnx"
    voices = folder / "voices-v1.0.bin"
    if not model.is_file() or not voices.is_file():
        print(json.dumps({"error": f"Kokoro model files not found in {folder}; run pc-worker/setup.ps1"}))
        return 3

    started = time.time()
    try:
        import soundfile as sf
        from kokoro_onnx import Kokoro

        kokoro = Kokoro(str(model), str(voices))
        samples, rate = kokoro.create(text, voice=args.voice, speed=args.speed, lang=args.lang)
        sf.write(args.out, samples, rate, subtype="PCM_16")
    except Exception as exc:  # the caller falls back to the browser's voice
        print(json.dumps({"error": f"{type(exc).__name__}: {exc}"[:500]}))
        return 1
    seconds = round(float(len(samples)) / float(rate), 2)
    print(
        json.dumps(
            {
                "seconds": seconds,
                "sample_rate": int(rate),
                "bytes": Path(args.out).stat().st_size,
                "voice": args.voice,
                "render_seconds": round(time.time() - started, 2),
            }
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
