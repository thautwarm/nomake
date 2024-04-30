/**
    Author: thautwarm (twshere@outlook.com)
    License: MIT
    Description:
        This file redirects the command as follow:
        ../deno.exe run -A build.ts arg1 arg2 ...
*/

#include <filesystem>
#include <iostream>

#ifdef _WIN32
#include <process.h>
#include <windows.h>
#else
#include <unistd.h>
#endif

namespace fs = std::filesystem;

#ifdef _WIN32
// borrowed from Julia project:
//  https://github.com/JuliaLang/julia/blob/831ebe048b80108558a76fac9e7dbb550353653b/cli/loader_win_utils.c#L135
wchar_t *utf8_to_wchar(const char *str) {
  /* Fast-path empty strings, as MultiByteToWideChar() returns zero for them. */
  if (str[0] == '\0') {
    wchar_t *wstr = reinterpret_cast<wchar_t *>(malloc(sizeof(wchar_t)));
    wstr[0] = L'\0';
    return wstr;
  }
  size_t len = MultiByteToWideChar(CP_UTF8, 0, str, -1, NULL, 0);
  if (!len)
    return nullptr;
  wchar_t *wstr = (wchar_t *)malloc(len * sizeof(wchar_t));
  if (!MultiByteToWideChar(CP_UTF8, 0, str, -1, wstr, len))
    return nullptr;
  return wstr;
}
#endif

int main(int nargv, char **argv) {
  fs::path curExePath;
  bool isWindows = false;
#ifdef _WIN32
  isWindows = true;
  wchar_t buffer[MAX_PATH];
  if (!GetModuleFileNameW(nullptr, buffer, MAX_PATH)) {
    auto err = GetLastError();
    std::cerr << "Failed to get current executable path, error code: " << err
              << std::endl;
  }
  curExePath = buffer;
#endif

  if (!isWindows) {
    curExePath = fs::canonical("/proc/self/exe");
  }

  // find ../deno(.exe) and normalize it
  fs::path denoPath = curExePath.parent_path() / "deno";
#ifdef _WIN32
  if (isWindows) {
    denoPath.replace_extension(".exe");
  }
#endif

  if (!fs::exists(denoPath)) {
    std::cerr << "Failed to find deno executable" << std::endl;
    return 1;
  }

#ifdef _WIN32
  if (isWindows) {
    auto wchars = denoPath.c_str();
    wchar_t **wargv = (wchar_t **)malloc(sizeof(wchar_t *) * (nargv + 4));
    if (!wargv) {
      std::cerr << "Failed to allocate memory" << std::endl;
      return 1;
    }
    wargv[0] = utf8_to_wchar(argv[0]);
    wargv[1] = utf8_to_wchar("run");
    wargv[2] = utf8_to_wchar("-A");
    wargv[3] = utf8_to_wchar("build.ts");
    for (int i = 1; i < nargv; i++) {
      wargv[i + 3] = utf8_to_wchar(argv[i]);
    }
    wargv[nargv + 3] = nullptr;
    int ret = _wspawnv(_P_WAIT, wchars, (const wchar_t *const *)wargv);
    /* no need to free as the process will exit */
    return ret;
  }
#endif
  char **new_argv = (char **)malloc(sizeof(char *) * (nargv + 4));
  if (!new_argv) {
    std::cerr << "Failed to allocate memory" << std::endl;
    return 1;
  }
  new_argv[0] = argv[0];
  new_argv[1] = const_cast<char *>("run");
  new_argv[2] = const_cast<char *>("-A");
  new_argv[3] = const_cast<char *>("build.ts");
  for (int i = 1; i < nargv; i++) {
    new_argv[i + 3] = argv[i];
  }
  new_argv[nargv + 3] = nullptr;
  /* no need to free as the process will exit */

#ifndef _WIN32
  // unix correctly handles UTF-8 encoding
  // so we don't need to convert
  int ret = execv(denoPath.c_str(), new_argv);
  return ret;
#endif

  return 0;
}