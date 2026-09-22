"""Transcribe one audio file with faster-whisper.

Protocol (consumed by transcription/transcriber.ts):
  stderr: `duration <seconds>` once the audio is known, then
          `progress <done> <total>` at most every PROGRESS_STEP seconds of
          audio. Any other stderr line is free-form status text.
  stdout: exactly one JSON document with the transcript.
  exit:   non-zero on any error.
"""

import argparse
import json
import os
import subprocess
import sys

import numpy as np

PROGRESS_STEP = 30
SAMPLING_RATE = 16000


def log(message):
    print(message, file=sys.stderr, flush=True)


# A mono downmix this much quieter than the left channel alone (in RMS) means
# the channels cancelled each other out.
CANCELLED_RATIO = 0.25


def decode_audio(path, sampling_rate=SAMPLING_RATE):
    """Decode any audio file to mono float32 PCM with the ffmpeg CLI.

    faster-whisper's own PyAV decoder stops at the first corrupt MP3 frame and
    silently returns a truncated signal; ffmpeg skips the bad frame and keeps
    going, which is what we want for a radio archive. Some episodes have
    phase-inverted stereo channels that cancel each other out in a mix, so the
    plain downmix is compared against the left channel alone and the louder of
    the two is kept.
    """
    mixed = run_ffmpeg(path, sampling_rate, [])
    left = run_ffmpeg(path, sampling_rate, ["-af", "pan=mono|c0=c0"])
    if rms(mixed) < rms(left) * CANCELLED_RATIO:
        log("Mono downmix is much quieter than the left channel (phase-inverted stereo); using the left channel.")
        return left
    return mixed


def rms(audio):
    return float(np.sqrt(np.mean(audio.astype(np.float64) ** 2))) if len(audio) else 0.0


def run_ffmpeg(path, sampling_rate, filters):
    result = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", path, *filters, "-f", "f32le", "-ac", "1", "-ar", str(sampling_rate), "-"],
        capture_output=True,
    )
    if result.returncode != 0 or not result.stdout:
        detail = result.stderr.decode(errors="replace").strip()
        raise RuntimeError(f"ffmpeg failed to decode {path}: {detail}")
    if result.stderr.strip():
        log(f"ffmpeg reported errors while decoding (continuing): {result.stderr.decode(errors='replace').strip()}")
    return np.frombuffer(result.stdout, dtype=np.float32)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("audio")
    parser.add_argument("--model", default="large-v3")
    parser.add_argument("--language", default="sl")
    parser.add_argument("--compute-type", default="int8")
    parser.add_argument("--beam-size", type=int, default=5)
    parser.add_argument(
        "--batch-size",
        type=int,
        default=0,
        help="use faster-whisper's batched pipeline with this batch size (0 = off)",
    )
    args = parser.parse_args()

    from faster_whisper import BatchedInferencePipeline, WhisperModel

    log(f'Loading model "{args.model}" (downloads on first use).')
    model = WhisperModel(
        args.model,
        device="cpu",
        compute_type=args.compute_type,
        cpu_threads=os.cpu_count() or 4,
    )

    options = dict(
        language=args.language,
        beam_size=args.beam_size,
        word_timestamps=True,
        vad_filter=True,
        vad_parameters={"min_silence_duration_ms": 500},
        condition_on_previous_text=False,
        hallucination_silence_threshold=2.0,
    )

    audio = decode_audio(args.audio)
    log(f"Decoded {len(audio) / SAMPLING_RATE:.1f} s of audio.")

    if args.batch_size > 0:
        pipeline = BatchedInferencePipeline(model=model)
        segments, info = pipeline.transcribe(
            audio, batch_size=args.batch_size, **options
        )
    else:
        segments, info = model.transcribe(audio, **options)

    log(f"duration {info.duration:.3f}")

    output = []
    next_report = PROGRESS_STEP
    for segment in segments:
        output.append(
            {
                "start": round(segment.start, 3),
                "end": round(segment.end, 3),
                "text": segment.text.strip(),
                "words": [
                    {
                        "start": round(word.start, 3),
                        "end": round(word.end, 3),
                        "word": word.word.strip(),
                    }
                    for word in (segment.words or [])
                ],
            }
        )
        if segment.end >= next_report:
            log(f"progress {segment.end:.3f} {info.duration:.3f}")
            next_report = (segment.end // PROGRESS_STEP + 1) * PROGRESS_STEP

    json.dump(
        {
            "engine": "faster-whisper",
            "model": args.model,
            "language": info.language,
            "duration": round(info.duration, 3),
            "segments": output,
        },
        sys.stdout,
        ensure_ascii=False,
    )
    sys.stdout.flush()


if __name__ == "__main__":
    main()
