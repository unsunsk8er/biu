cmake_minimum_required(VERSION 3.5.0)
project(native_audio)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_library(native_audio SHARED native_audio.cpp)

target_link_libraries(native_audio PUBLIC libace_napi.z.so)
