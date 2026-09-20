"""Run with: uv run --project transcription/sidecar python -m unittest discover transcription/sidecar"""

import os
import subprocess
import tempfile
import unittest

from transcribe import decode_audio


def make_mp3(path, seconds):
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", f"sine=frequency=440:duration={seconds}", "-ar", "44100", "-b:a", "128k", path],
        check=True,
    )


class DecodeAudioTest(unittest.TestCase):
    def test_decodes_full_length_past_corrupt_frames(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "a.mp3")
            make_mp3(path, 20)
            data = bytearray(open(path, "rb").read())
            mid = len(data) // 2
            data[mid : mid + 2000] = b"\xff" * 2000
            open(path, "wb").write(data)

            audio = decode_audio(path)

            self.assertEqual(audio.dtype.name, "float32")
            self.assertAlmostEqual(len(audio) / 16000, 20, delta=0.5)

    def test_fails_on_unreadable_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "a.mp3")
            open(path, "wb").write(b"not audio")
            with self.assertRaises(RuntimeError):
                decode_audio(path)


if __name__ == "__main__":
    unittest.main()



class PhaseInvertedStereoTest(unittest.TestCase):
    def test_survives_phase_inverted_stereo(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "inverted.wav")
            subprocess.run(
                [
                    "ffmpeg", "-v", "error", "-y",
                    "-f", "lavfi", "-i", "sine=frequency=440:duration=4",
                    "-f", "lavfi", "-i", "anoisesrc=duration=4:amplitude=0.06:seed=1",
                    "-filter_complex", "[0:a]volume=6[t];[t][1:a]amerge=inputs=2,pan=stereo|c0=c0|c1=-1*c0+c1[out]",
                    "-map", "[out]", path,
                ],
                check=True,
            )
            audio = decode_audio(path)
            self.assertGreater(float(abs(audio).max()), 0.1)
