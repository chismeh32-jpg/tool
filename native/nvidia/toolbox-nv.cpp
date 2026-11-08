// toolbox-nv: lee y cambia ajustes del perfil GLOBAL del driver de NVIDIA (los mismos que el
// Panel de control de NVIDIA) usando NVAPI, la API oficial que instala el propio driver.
//
// Uso (siempre responde una línea JSON por la salida estándar):
//   toolbox-nv info                         → tarjeta(s) y versión del driver
//   toolbox-nv get 0x1057EB71 0x007BA09E    → valor actual de esos ajustes
//   toolbox-nv set 0x1057EB71=1 ...          → cambia ajustes (tipo DWORD) y guarda
//   toolbox-nv reset 0x1057EB71 ...          → vuelve al valor de fábrica de NVIDIA y guarda
//
// Si no hay tarjeta o driver de NVIDIA responde {"available":false,...} y sale con código 0.
#include <windows.h>
#include <cstdio>
#include <cstdlib>
#include <string>
#include "nvapi.h"

static std::string esc(const char* s) {
  std::string o;
  for (; s && *s; ++s) {
    if (*s == '"' || *s == '\\') { o += '\\'; o += *s; }
    else if ((unsigned char)*s >= 0x20) o += *s;
  }
  return o;
}

static std::string msg(NvAPI_Status s) {
  NvAPI_ShortString m = {0};
  NvAPI_GetErrorMessage(s, m);
  return esc(m);
}

static int fail(const char* stage, NvAPI_Status s) {
  printf("{\"available\":%s,\"ok\":false,\"stage\":\"%s\",\"status\":%d,\"error\":\"%s\"}\n",
         stage[0] == 'i' && stage[1] == 'n' && stage[2] == 'i' ? "false" : "true", stage, (int)s, msg(s).c_str());
  return 0;
}

static bool parseId(const char* text, NvU32* out) {
  char* end = nullptr;
  unsigned long v = strtoul(text, &end, 0);
  if (end == text) return false;
  *out = (NvU32)v;
  return true;
}

int main(int argc, char** argv) {
  if (argc < 2) { puts("{\"ok\":false,\"error\":\"uso: info | get <id>... | set <id>=<valor>... | reset <id>...\"}"); return 2; }
  const std::string cmd = argv[1];

  NvAPI_Status s = NvAPI_Initialize();
  if (s != NVAPI_OK) return fail("init", s);

  if (cmd == "info") {
    NvU32 driver = 0;
    NvAPI_ShortString branch = {0};
    NvAPI_SYS_GetDriverAndBranchVersion(&driver, branch);
    NvPhysicalGpuHandle gpus[NVAPI_MAX_PHYSICAL_GPUS] = {0};
    NvU32 count = 0;
    NvAPI_EnumPhysicalGPUs(gpus, &count);
    printf("{\"available\":true,\"ok\":true,\"driver\":\"%u.%02u\",\"branch\":\"%s\",\"gpus\":[", driver / 100, driver % 100, esc(branch).c_str());
    for (NvU32 i = 0; i < count; ++i) {
      NvAPI_ShortString name = {0};
      NvAPI_GPU_GetFullName(gpus[i], name);
      printf("%s\"%s\"", i ? "," : "", esc(name).c_str());
    }
    puts("]}");
    NvAPI_Unload();
    return 0;
  }

  NvDRSSessionHandle session = 0;
  if ((s = NvAPI_DRS_CreateSession(&session)) != NVAPI_OK) return fail("session", s);
  if ((s = NvAPI_DRS_LoadSettings(session)) != NVAPI_OK) return fail("load", s);
  NvDRSProfileHandle profile = 0;
  if ((s = NvAPI_DRS_GetCurrentGlobalProfile(session, &profile)) != NVAPI_OK) return fail("profile", s);

  bool changed = false, allOk = true;
  printf("{\"available\":true,\"results\":[");
  for (int i = 2; i < argc; ++i) {
    std::string arg = argv[i];
    if (i > 2) printf(",");
    if (cmd == "get") {
      NvU32 id;
      if (!parseId(arg.c_str(), &id)) { printf("{\"arg\":\"%s\",\"ok\":false,\"error\":\"id no válido\"}", esc(arg.c_str()).c_str()); allOk = false; continue; }
      NVDRS_SETTING st = {0};
      st.version = NVDRS_SETTING_VER;
      s = NvAPI_DRS_GetSetting(session, profile, id, &st);
      if (s == NVAPI_SETTING_NOT_FOUND) printf("{\"id\":%u,\"ok\":true,\"set\":false}", id);
      else if (s == NVAPI_OK) printf("{\"id\":%u,\"ok\":true,\"set\":true,\"type\":%d,\"value\":%u,\"predefined\":%s}",
                                     id, (int)st.settingType, st.u32CurrentValue, st.isCurrentPredefined ? "true" : "false");
      else { printf("{\"id\":%u,\"ok\":false,\"error\":\"%s\"}", id, msg(s).c_str()); allOk = false; }
    } else if (cmd == "set") {
      size_t eq = arg.find('=');
      NvU32 id, value;
      if (eq == std::string::npos || !parseId(arg.substr(0, eq).c_str(), &id) || !parseId(arg.substr(eq + 1).c_str(), &value)) {
        printf("{\"arg\":\"%s\",\"ok\":false,\"error\":\"formato id=valor\"}", esc(arg.c_str()).c_str()); allOk = false; continue;
      }
      NVDRS_SETTING st = {0};
      st.version = NVDRS_SETTING_VER;
      st.settingId = id;
      st.settingType = NVDRS_DWORD_TYPE;
      st.u32CurrentValue = value;
      s = NvAPI_DRS_SetSetting(session, profile, &st);
      if (s == NVAPI_OK) { changed = true; printf("{\"id\":%u,\"ok\":true,\"value\":%u}", id, value); }
      else { printf("{\"id\":%u,\"ok\":false,\"error\":\"%s\"}", id, msg(s).c_str()); allOk = false; }
    } else if (cmd == "reset") {
      NvU32 id;
      if (!parseId(arg.c_str(), &id)) { printf("{\"arg\":\"%s\",\"ok\":false,\"error\":\"id no válido\"}", esc(arg.c_str()).c_str()); allOk = false; continue; }
      s = NvAPI_DRS_RestoreProfileDefaultSetting(session, profile, id);
      // Si el ajuste ya estaba en su valor de fábrica, NVAPI dice que no hay nada que restaurar: es un éxito
      if (s == NVAPI_OK || s == NVAPI_SETTING_NOT_FOUND || s == NVAPI_PROFILE_NOT_FOUND) { changed = changed || s == NVAPI_OK; printf("{\"id\":%u,\"ok\":true}", id); }
      else { printf("{\"id\":%u,\"ok\":false,\"error\":\"%s\"}", id, msg(s).c_str()); allOk = false; }
    } else {
      printf("{\"ok\":false,\"error\":\"orden desconocida\"}"); allOk = false; break;
    }
  }
  printf("]");
  if (changed) {
    s = NvAPI_DRS_SaveSettings(session);
    if (s != NVAPI_OK) { allOk = false; printf(",\"saveError\":\"%s\"", msg(s).c_str()); }
  }
  printf(",\"ok\":%s}\n", allOk ? "true" : "false");
  NvAPI_DRS_DestroySession(session);
  NvAPI_Unload();
  return 0;
}
