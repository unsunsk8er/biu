#include <cstdint>
#include <fstream>
#include <string>
#include <vector>

#include "napi/native_api.h"

namespace {

uint32_t readBe32(const std::vector<uint8_t>& data, size_t offset) {
  return (static_cast<uint32_t>(data[offset]) << 24) |
         (static_cast<uint32_t>(data[offset + 1]) << 16) |
         (static_cast<uint32_t>(data[offset + 2]) << 8) |
         static_cast<uint32_t>(data[offset + 3]);
}

uint64_t readBe64(const std::vector<uint8_t>& data, size_t offset) {
  uint64_t value = 0;
  for (int i = 0; i < 8; i++) {
    value = (value << 8) | data[offset + static_cast<size_t>(i)];
  }
  return value;
}

void writeBe32(std::vector<uint8_t>& data, size_t offset, uint32_t value) {
  data[offset] = static_cast<uint8_t>((value >> 24) & 0xFF);
  data[offset + 1] = static_cast<uint8_t>((value >> 16) & 0xFF);
  data[offset + 2] = static_cast<uint8_t>((value >> 8) & 0xFF);
  data[offset + 3] = static_cast<uint8_t>(value & 0xFF);
}

void writeBe64(std::vector<uint8_t>& data, size_t offset, uint64_t value) {
  for (int i = 7; i >= 0; i--) {
    data[offset + static_cast<size_t>(7 - i)] = static_cast<uint8_t>((value >> (i * 8)) & 0xFF);
  }
}

std::string boxType(const std::vector<uint8_t>& data, size_t offset) {
  if (offset + 8 > data.size()) return "";
  return std::string(reinterpret_cast<const char*>(data.data() + offset + 4), 4);
}

struct TopBox {
  size_t offset = 0;
  uint64_t size = 0;
};

bool parseTopBoxes(const std::vector<uint8_t>& data, std::vector<TopBox>& boxes) {
  size_t offset = 0;
  while (offset + 8 <= data.size()) {
    uint64_t size = readBe32(data, offset);
    if (size == 1) {
      if (offset + 16 > data.size()) return false;
      size = readBe64(data, offset + 8);
    } else if (size == 0) {
      size = data.size() - offset;
    }
    if (size < 8 || offset + size > data.size()) return false;
    boxes.push_back({offset, size});
    offset += static_cast<size_t>(size);
  }
  return true;
}

// AVPlayer is sensitive to the moov atom being after mdat. Move moov before
// mdat and shift every stco/co64 chunk offset by the moov size.
bool remuxFastStart(const std::string& inputPath, const std::string& outputPath) {
  std::ifstream input(inputPath, std::ios::binary | std::ios::ate);
  if (!input) return false;
  const std::streamsize length = input.tellg();
  if (length <= 0) return false;
  input.seekg(0);
  std::vector<uint8_t> data(static_cast<size_t>(length));
  if (!input.read(reinterpret_cast<char*>(data.data()), length)) return false;

  std::vector<TopBox> boxes;
  if (!parseTopBoxes(data, boxes)) return false;

  int moovIndex = -1;
  int mdatIndex = -1;
  for (size_t i = 0; i < boxes.size(); i++) {
    const std::string type = boxType(data, boxes[i].offset);
    if (type == "moov" && moovIndex < 0) moovIndex = static_cast<int>(i);
    if (type == "mdat" && mdatIndex < 0) mdatIndex = static_cast<int>(i);
  }
  if (moovIndex < 0 || mdatIndex < 0) return false;
  if (moovIndex < mdatIndex) {
    // Already faststart.
    std::ofstream copy(outputPath, std::ios::binary | std::ios::trunc);
    if (!copy) return false;
    copy.write(reinterpret_cast<const char*>(data.data()), length);
    return static_cast<bool>(copy);
  }

  const TopBox moov = boxes[static_cast<size_t>(moovIndex)];
  const uint64_t shift = moov.size;
  std::vector<uint8_t> moovData(moov.size);
  for (size_t i = 0; i < moov.size; i++) moovData[i] = data[moov.offset + i];

  // Patch all stco/co64 boxes inside the copied moov payload.
  for (size_t i = 0; i + 16 < moovData.size(); i++) {
    const bool isStco = moovData[i] == 's' && moovData[i + 1] == 't' &&
                        moovData[i + 2] == 'c' && moovData[i + 3] == 'o';
    const bool isCo64 = moovData[i] == 'c' && moovData[i + 1] == 'o' &&
                        moovData[i + 2] == '6' && moovData[i + 3] == '4';
    if (!isStco && !isCo64) continue;
    const size_t boxStart = i - 4;
    if (boxStart < 8) continue;
    const uint64_t boxSize = readBe32(moovData, boxStart);
    if (boxSize < 16 || boxStart + boxSize > moovData.size()) continue;
    const uint32_t count = readBe32(moovData, i + 8);
    const size_t entrySize = isStco ? 4 : 8;
    if (i + 12 + static_cast<uint64_t>(count) * entrySize > boxStart + boxSize) continue;
    for (uint32_t entry = 0; entry < count; entry++) {
      const size_t entryOffset = i + 12 + static_cast<size_t>(entry) * entrySize;
      if (isStco) {
        const uint32_t oldOffset = readBe32(moovData, entryOffset);
        writeBe32(moovData, entryOffset, static_cast<uint32_t>(oldOffset + shift));
      } else {
        const uint64_t oldOffset = readBe64(moovData, entryOffset);
        writeBe64(moovData, entryOffset, oldOffset + shift);
      }
    }
  }

  std::vector<uint8_t> output;
  output.reserve(data.size());
  for (size_t i = 0; i < static_cast<size_t>(mdatIndex); i++) {
    const TopBox box = boxes[i];
    output.insert(output.end(), data.begin() + static_cast<std::ptrdiff_t>(box.offset),
                  data.begin() + static_cast<std::ptrdiff_t>(box.offset + box.size));
  }
  output.insert(output.end(), moovData.begin(), moovData.end());
  for (size_t i = static_cast<size_t>(mdatIndex); i < boxes.size(); i++) {
    if (static_cast<int>(i) == moovIndex) continue;
    const TopBox box = boxes[i];
    output.insert(output.end(), data.begin() + static_cast<std::ptrdiff_t>(box.offset),
                  data.begin() + static_cast<std::ptrdiff_t>(box.offset + box.size));
  }

  std::ofstream out(outputPath, std::ios::binary | std::ios::trunc);
  if (!out) return false;
  out.write(reinterpret_cast<const char*>(output.data()), static_cast<std::streamsize>(output.size()));
  return static_cast<bool>(out);
}

napi_value RemuxFastStart(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value args[2] = {nullptr};
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  if (argc < 2) {
    napi_value result;
    napi_get_boolean(env, false, &result);
    return result;
  }

  size_t inputLength = 0;
  size_t outputLength = 0;
  napi_get_value_string_utf8(env, args[0], nullptr, 0, &inputLength);
  napi_get_value_string_utf8(env, args[1], nullptr, 0, &outputLength);
  std::string inputPath(inputLength + 1, '\0');
  std::string outputPath(outputLength + 1, '\0');
  napi_get_value_string_utf8(env, args[0], inputPath.data(), inputLength + 1, &inputLength);
  napi_get_value_string_utf8(env, args[1], outputPath.data(), outputLength + 1, &outputLength);
  inputPath.resize(inputLength);
  outputPath.resize(outputLength);

  napi_value result;
  napi_get_boolean(env, remuxFastStart(inputPath, outputPath), &result);
  return result;
}

napi_value GetVersion(napi_env env, napi_callback_info info) {
  napi_value result;
  napi_create_string_utf8(env, "native-audio-1", NAPI_AUTO_LENGTH, &result);
  return result;
}

}  // namespace

EXTERN_C_START
static napi_value Init(napi_env env, napi_value exports) {
  napi_property_descriptor desc[] = {
    {"remuxFastStart", nullptr, RemuxFastStart, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"version", nullptr, GetVersion, nullptr, nullptr, nullptr, napi_default, nullptr},
  };
  napi_define_properties(env, exports, sizeof(desc) / sizeof(desc[0]), desc);
  return exports;
}
EXTERN_C_END

static napi_module nativeAudioModule = {
  .nm_version = 1,
  .nm_flags = 0,
  .nm_filename = nullptr,
  .nm_register_func = Init,
  .nm_modname = "native_audio",
  .nm_priv = nullptr,
  .reserved = {0},
};

extern "C" __attribute__((constructor)) void RegisterNativeAudioModule(void) {
  napi_module_register(&nativeAudioModule);
}
