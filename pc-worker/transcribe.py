"""
Transcribe one audio file with Whisper on this PC (master run §9, "local first").

    .venv\\Scripts\\python transcribe.py <audio file> [--model large-v3-turbo] [--language en]

Prints one line of JSON: {"text", "language", "duration", "model", "device", "seconds"}.
Runs on the graphics card when it can and on the processor when it cannot.
The model (about 1.6 GB) downloads once, to the Hugging Face cache.
"""
import argparse
import json
import os
import sys
import time
from pathlib import Path


def add_nvidia_dlls() -> None:
    """The pip packages nvidia-cublas-cu12 / nvidia-cudnn-cu12 put their DLLs
    under site-packages/nvidia/*/bin, which Windows does not search."""
    if os.name != "nt":
        return
    for base in map(Path, sys.path):
        root = base / "nvidia"
        if not root.is_dir():
            continue
        for bin_dir in root.glob("*/bin"):
            os.add_dll_directory(str(bin_dir))
            os.environ["PATH"] = str(bin_dir) + os.pathsep + os.environ.get("PATH", "")


def decode_audio(path: str, rate: int = 16000):
    """The file as mono 16 kHz float32 samples.

    The Whisper library has its own decoder, but it passes an argument the
    current PyAV release no longer accepts, so the decoding is done here with
    the same library and the samples are handed over ready-made."""
    import av
    import numpy as np

    resampler = av.AudioResampler(format="s16", layout="mono", rate=rate)
    chunks = []
    with av.open(path, mode="r") as container:
        for frame in container.decode(audio=0):
            for out in resampler.resample(frame):
                chunks.append(out.to_ndarray().reshape(-1))
        for out in resampler.resample(None):
            chunks.append(out.to_ndarray().reshape(-1))
    if not chunks:
        return np.zeros(0, dtype=np.float32)
    return np.concatenate(chunks).astype(np.float32) / 32768.0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("audio")
    parser.add_argument("--model", default="large-v3-turbo")
    parser.add_argument("--language", default=None)
    parser.add_argument("--device", default="auto", choices=["auto", "cuda", "cpu"])
    args = parser.parse_args()

    if not Path(args.audio).is_file():
        print(json.dumps({"error": "audio file not found"}))
        return 2

    add_nvidia_dlls()
    from faster_whisper import WhisperModel

    started = time.time()
    try:
        samples = decode_audio(args.audio)
    except Exception as exc:
        print(json.dumps({"error": f"could not read the audio: {exc}"}))
        return 1
    if samples.size == 0:
        print(json.dumps({"text": "", "language": None, "duration": 0, "model": args.model, "device": None, "seconds": 0}))
        return 0
    attempts = [("cuda", "float16"), ("cpu", "int8")] if args.device == "auto" else [(args.device, "float16" if args.device == "cuda" else "int8")]
    last_error = None
    for device, compute in attempts:
        try:
            model = WhisperModel(args.model, device=device, compute_type=compute)
            segments, info = model.transcribe(
                samples,
                language=args.language,
                vad_filter=True,
                beam_size=5,
                condition_on_previous_text=False,
            )
            text = " ".join(s.text.strip() for s in segments).strip()
            print(
                json.dumps(
                    {
                        "text": text,
                        "language": info.language,
                        "duration": round(info.duration, 2),
                        "model": args.model,
                        "device": device,
                        "seconds": round(time.time() - started, 2),
                    },
                    ensure_ascii=False,
                )
            )
            return 0
        except Exception as exc:  # try the processor if the graphics card path fails
            last_error = f"{device}: {exc}"
    print(json.dumps({"error": last_error or "transcription failed"}))
    return 1


if __name__ == "__main__":
    sys.exit(main())
