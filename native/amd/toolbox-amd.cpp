// toolbox-amd: lee y cambia ajustes de gráficos de AMD Software: Adrenalin Edition usando ADLX,
// el SDK oficial de AMD que viene con el driver (amdadlx64.dll).
//
// Uso (siempre responde una línea JSON):
//   toolbox-amd info                                    → GPU y estado de cada función
//   toolbox-amd set antiLag=1 sharpening=1 sharpness=80 chill=0 boost=0 enhancedSync=0
//
// Si no hay GPU o driver de AMD responde {"available":false,...} y sale con código 0.
#include "SDK/ADLXHelper/Windows/Cpp/ADLXHelper.h"
#include "SDK/Include/I3DSettings.h"
#include <cstdio>
#include <cstdlib>
#include <string>

using namespace adlx;
static ADLXHelper g_help;

static std::string esc(const char* s) {
  std::string o;
  for (; s && *s; ++s) {
    if (*s == '"' || *s == '\\') { o += '\\'; o += *s; }
    else if ((unsigned char)*s >= 0x20) o += *s;
  }
  return o;
}

// Escribe "nombre":{"supported":..,"enabled":..} para una función con IsSupported/IsEnabled
template <typename T>
static void feature(const char* name, T& f, bool comma, const std::string& extra = "") {
  adlx_bool sup = false, en = false;
  if (f) { f->IsSupported(&sup); if (sup) f->IsEnabled(&en); }
  printf("%s\"%s\":{\"supported\":%s,\"enabled\":%s%s}", comma ? "," : "", name, sup ? "true" : "false", en ? "true" : "false", extra.c_str());
}

int main(int argc, char** argv) {
  if (argc < 2) { puts("{\"ok\":false,\"error\":\"uso: info | set clave=valor...\"}"); return 2; }
  const std::string cmd = argv[1];

  ADLX_RESULT res = g_help.Initialize();
  if (ADLX_FAILED(res)) { printf("{\"available\":false,\"ok\":false,\"stage\":\"init\",\"status\":%d}\n", (int)res); return 0; }

  IADLXGPUListPtr gpus;
  IADLX3DSettingsServicesPtr srv;
  res = g_help.GetSystemServices()->GetGPUs(&gpus);
  if (ADLX_FAILED(res) || gpus->Empty()) { puts("{\"available\":false,\"ok\":false,\"stage\":\"gpus\"}"); g_help.Terminate(); return 0; }
  res = g_help.GetSystemServices()->Get3DSettingsServices(&srv);
  if (ADLX_FAILED(res)) { printf("{\"available\":true,\"ok\":false,\"stage\":\"3dsettings\",\"status\":%d}\n", (int)res); g_help.Terminate(); return 0; }

  IADLXGPUPtr gpu;
  gpus->At(0, &gpu);
  const char* gpuName = nullptr;
  gpu->Name(&gpuName);

  IADLX3DAntiLagPtr antiLag;           srv->GetAntiLag(gpu, &antiLag);
  IADLX3DImageSharpeningPtr sharp;     srv->GetImageSharpening(gpu, &sharp);
  IADLX3DChillPtr chill;               srv->GetChill(gpu, &chill);
  IADLX3DBoostPtr boost;               srv->GetBoost(gpu, &boost);
  IADLX3DEnhancedSyncPtr esync;        srv->GetEnhancedSync(gpu, &esync);

  if (cmd == "info") {
    std::string sharpExtra;
    if (sharp) {
      adlx_int v = 0; ADLX_IntRange r = {};
      sharp->GetSharpness(&v); sharp->GetSharpnessRange(&r);
      sharpExtra = ",\"sharpness\":" + std::to_string(v) + ",\"min\":" + std::to_string(r.minValue) + ",\"max\":" + std::to_string(r.maxValue);
    }
    printf("{\"available\":true,\"ok\":true,\"gpu\":\"%s\",\"gpuCount\":%u,\"features\":{", esc(gpuName).c_str(), (unsigned)gpus->Size());
    feature("antiLag", antiLag, false);
    feature("sharpening", sharp, true, sharpExtra);
    feature("chill", chill, true);
    feature("boost", boost, true);
    feature("enhancedSync", esync, true);
    puts("}}");
    g_help.Terminate();
    return 0;
  }

  if (cmd != "set") { puts("{\"ok\":false,\"error\":\"orden desconocida\"}"); g_help.Terminate(); return 2; }
  bool allOk = true;
  printf("{\"available\":true,\"results\":[");
  for (int i = 2; i < argc; ++i) {
    std::string arg = argv[i];
    size_t eq = arg.find('=');
    std::string key = arg.substr(0, eq);
    int value = eq == std::string::npos ? 0 : atoi(arg.substr(eq + 1).c_str());
    ADLX_RESULT r = ADLX_NOT_SUPPORTED;
    if (key == "antiLag" && antiLag) r = antiLag->SetEnabled(value != 0);
    else if (key == "sharpening" && sharp) r = sharp->SetEnabled(value != 0);
    else if (key == "sharpness" && sharp) r = sharp->SetSharpness(value);
    else if (key == "chill" && chill) r = chill->SetEnabled(value != 0);
    else if (key == "boost" && boost) r = boost->SetEnabled(value != 0);
    else if (key == "enhancedSync" && esync) r = esync->SetEnabled(value != 0);
    bool ok = ADLX_SUCCEEDED(r);
    allOk = allOk && ok;
    printf("%s{\"key\":\"%s\",\"value\":%d,\"ok\":%s,\"status\":%d}", i > 2 ? "," : "", esc(key.c_str()).c_str(), value, ok ? "true" : "false", (int)r);
  }
  printf("],\"ok\":%s}\n", allOk ? "true" : "false");
  g_help.Terminate();
  return 0;
}
