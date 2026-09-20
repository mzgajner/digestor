#!/bin/sh
# Builds whisper.cpp with the Vulkan backend into .cache/whisper.cpp and
# downloads the models the WhisperCppTranscriber expects.
#
# Needs: git, a C++ compiler, cmake, ninja (optional), glslc and the Vulkan
# headers. On Fedora: sudo dnf install cmake ninja-build glslc vulkan-headers
# vulkan-loader-devel. Without root, point VULKAN_SDK at an unpacked LunarG SDK
# (https://vulkan.lunarg.com/sdk/home) and put cmake on PATH.
set -eu

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
DIR=${WHISPER_CPP_DIR:-$ROOT/.cache/whisper.cpp}
COMMIT=${WHISPER_CPP_COMMIT:-1da4dc8}
MODELS="${WHISPER_CPP_MODELS:-large-v3-q5_0}"

if [ -n "${VULKAN_SDK:-}" ]; then
  export PATH="$VULKAN_SDK/bin:$PATH"
  EXTRA="-DVulkan_INCLUDE_DIR=$VULKAN_SDK/include -DVulkan_GLSLC_EXECUTABLE=$VULKAN_SDK/bin/glslc"
  for lib in /usr/lib64/libvulkan.so /usr/lib64/libvulkan.so.1 /usr/lib/x86_64-linux-gnu/libvulkan.so.1; do
    [ -e "$lib" ] && EXTRA="$EXTRA -DVulkan_LIBRARY=$lib" && break
  done
else
  EXTRA=""
fi

if [ ! -d "$DIR/.git" ]; then
  git clone -q https://github.com/ggml-org/whisper.cpp.git "$DIR"
fi
cd "$DIR"
git fetch -q --depth 1 origin "$COMMIT" 2>/dev/null || git fetch -q origin
git checkout -q "$COMMIT"

GENERATOR=""
command -v ninja >/dev/null && GENERATOR="-G Ninja"
# shellcheck disable=SC2086
cmake -B build $GENERATOR -DCMAKE_BUILD_TYPE=Release -DGGML_VULKAN=ON \
  -DWHISPER_BUILD_TESTS=OFF -DWHISPER_BUILD_EXAMPLES=ON $EXTRA
cmake --build build --config Release --target whisper-cli

for model in $MODELS; do
  [ -f "models/ggml-$model.bin" ] || sh models/download-ggml-model.sh "$model"
done
[ -f models/ggml-silero-v5.1.2.bin ] || sh models/download-vad-model.sh silero-v5.1.2

echo "whisper.cpp ready: $DIR/build/bin/whisper-cli"
