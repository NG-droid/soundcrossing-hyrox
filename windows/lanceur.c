/* Soundcrossing.exe : lance le serveur (runtime\python.exe server.py) sans fenêtre noire,
 * puis reste en icône près de l'horloge, d'où l'on rouvre l'application ou l'arrête.
 * Compilé par la CI (scripts/package_windows.py) avec MinGW. */
#ifndef UNICODE
#define UNICODE
#endif
#ifndef _UNICODE
#define _UNICODE
#endif
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <shellapi.h>
#include <wchar.h>

#define URL L"http://127.0.0.1:8767/"
#define JOURNAL L"soundcrossing-journal.txt"
#define WM_ICONE (WM_APP + 1)
#define WM_SERVEUR_ARRETE (WM_APP + 2)
#define CMD_OUVRIR 1
#define CMD_QUITTER 2

static wchar_t dossier[MAX_PATH];
static HWND fenetre;
static NOTIFYICONDATAW icone;
static PROCESS_INFORMATION serveur;
static UINT barre_recreee;
static BOOL on_quitte;

static void ouvrir_application(void) {
  ShellExecuteW(NULL, L"open", URL, NULL, NULL, SW_SHOWNORMAL);
}

static void erreur(const wchar_t *texte) {
  MessageBoxW(NULL, texte, L"Soundcrossing", MB_OK | MB_ICONERROR | MB_SETFOREGROUND);
}

static void ajouter_icone(BOOL bulle) {
  icone.uFlags = NIF_ICON | NIF_TIP | NIF_MESSAGE | (bulle ? NIF_INFO : 0);
  Shell_NotifyIconW(NIM_ADD, &icone);
  icone.uVersion = NOTIFYICON_VERSION;
  Shell_NotifyIconW(NIM_SETVERSION, &icone);
}

/* Fin du journal (là où server.py écrit ses messages), pour expliquer un arrêt inattendu. */
static void fin_du_journal(wchar_t *texte, int place) {
  wchar_t chemin[MAX_PATH + 64];
  char octets[600];
  DWORD lus = 0;
  texte[0] = 0;
  swprintf(chemin, MAX_PATH + 64, L"%ls\\%ls", dossier, JOURNAL);
  HANDLE f = CreateFileW(chemin, GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE, NULL, OPEN_EXISTING, 0, NULL);
  if (f == INVALID_HANDLE_VALUE) return;
  LARGE_INTEGER taille;
  if (GetFileSizeEx(f, &taille) && taille.QuadPart > (LONGLONG)sizeof(octets) - 1) {
    LARGE_INTEGER debut;
    debut.QuadPart = taille.QuadPart - (sizeof(octets) - 1);
    SetFilePointerEx(f, debut, NULL, FILE_BEGIN);
  }
  ReadFile(f, octets, sizeof(octets) - 1, &lus, NULL);
  CloseHandle(f);
  octets[lus] = 0;
  char *depart = octets;
  if (lus == sizeof(octets) - 1) {  /* coupé au milieu : on repart d'une ligne entière */
    char *ligne = strchr(octets, '\n');
    if (ligne) depart = ligne + 1;
  }
  MultiByteToWideChar(CP_UTF8, 0, depart, -1, texte, place);
  for (size_t n = wcslen(texte); n && (texte[n - 1] == L'\n' || texte[n - 1] == L'\r' || texte[n - 1] == L' '); n--)
    texte[n - 1] = 0;
}

static void arreter_serveur(void) {
  if (serveur.hProcess) {
    TerminateProcess(serveur.hProcess, 0);
    WaitForSingleObject(serveur.hProcess, 5000);
  }
}

static DWORD WINAPI surveiller_serveur(LPVOID rien) {
  (void)rien;
  WaitForSingleObject(serveur.hProcess, INFINITE);
  PostMessageW(fenetre, WM_SERVEUR_ARRETE, 0, 0);
  return 0;
}

static void menu(void) {
  HMENU m = CreatePopupMenu();
  AppendMenuW(m, MF_STRING, CMD_OUVRIR, L"Ouvrir Soundcrossing");
  AppendMenuW(m, MF_SEPARATOR, 0, NULL);
  AppendMenuW(m, MF_STRING, CMD_QUITTER, L"Quitter Soundcrossing");
  SetMenuDefaultItem(m, CMD_OUVRIR, FALSE);
  POINT p;
  GetCursorPos(&p);
  SetForegroundWindow(fenetre);
  UINT choix = TrackPopupMenu(m, TPM_RETURNCMD | TPM_RIGHTBUTTON | TPM_NONOTIFY, p.x, p.y, 0, fenetre, NULL);
  DestroyMenu(m);
  if (choix == CMD_OUVRIR) ouvrir_application();
  if (choix == CMD_QUITTER &&
      MessageBoxW(fenetre,
                  L"Arrêter Soundcrossing ?\n\nVos inscriptions et résultats restent enregistrés. "
                  L"Tant qu'il n'est pas relancé, les pages ouvertes n'enregistrent plus sur l'ordinateur "
                  L"(le témoin de sauvegarde passe au rouge).",
                  L"Soundcrossing", MB_YESNO | MB_ICONQUESTION | MB_DEFBUTTON2 | MB_SETFOREGROUND) == IDYES) {
    on_quitte = TRUE;
    arreter_serveur();
    DestroyWindow(fenetre);
  }
}

static LRESULT CALLBACK procedure(HWND h, UINT msg, WPARAM w, LPARAM l) {
  if (msg == WM_ICONE) {
    if (l == WM_LBUTTONUP || l == WM_LBUTTONDBLCLK) ouvrir_application();
    if (l == WM_RBUTTONUP || l == WM_CONTEXTMENU) menu();
    return 0;
  }
  if (msg == WM_SERVEUR_ARRETE) {
    DWORD code = 0;
    GetExitCodeProcess(serveur.hProcess, &code);
    /* Code 0 sans demande d'arrêt : un autre Soundcrossing tournait déjà, server.py a ouvert le navigateur dessus. */
    if (!on_quitte && code != 0) {
      wchar_t journal[600], texte[1200];
      fin_du_journal(journal, 600);
      swprintf(texte, 1200,
               L"Soundcrossing s'est arrêté.\n\n%ls\n\nVos inscriptions et résultats sont conservés. "
               L"Relancez Soundcrossing.exe. Détails : fichier %ls dans le dossier Soundcrossing.",
               journal, JOURNAL);
      Shell_NotifyIconW(NIM_DELETE, &icone);
      erreur(texte);
    }
    DestroyWindow(h);
    return 0;
  }
  if (msg == WM_ENDSESSION && w) {
    arreter_serveur();
    return 0;
  }
  if (msg == WM_DESTROY) {
    Shell_NotifyIconW(NIM_DELETE, &icone);
    PostQuitMessage(0);
    return 0;
  }
  if (msg == barre_recreee) {  /* l'Explorateur a redémarré : on remet l'icône */
    ajouter_icone(FALSE);
    return 0;
  }
  return DefWindowProcW(h, msg, w, l);
}

int WINAPI wWinMain(HINSTANCE instance, HINSTANCE precedente, PWSTR ligne, int affichage) {
  (void)precedente; (void)ligne; (void)affichage;
  GetModuleFileNameW(NULL, dossier, MAX_PATH);
  wchar_t *barre = wcsrchr(dossier, L'\\');
  if (barre) *barre = 0;
  SetCurrentDirectoryW(dossier);

  /* Déjà ouvert depuis ce dossier : on montre simplement l'application. */
  wchar_t nom[MAX_PATH + 32] = L"Local\\Soundcrossing-";
  size_t n = wcslen(nom);
  for (const wchar_t *c = dossier; *c && n < MAX_PATH + 30; c++) nom[n++] = (*c == L'\\') ? L'/' : *c;
  nom[n] = 0;
  CreateMutexW(NULL, TRUE, nom);
  if (GetLastError() == ERROR_ALREADY_EXISTS) {
    ouvrir_application();
    return 0;
  }

  wchar_t python[MAX_PATH + 64], script[MAX_PATH + 64], journal[MAX_PATH + 64], commande[3 * MAX_PATH];
  swprintf(python, MAX_PATH + 64, L"%ls\\runtime\\python.exe", dossier);
  swprintf(script, MAX_PATH + 64, L"%ls\\server.py", dossier);
  swprintf(journal, MAX_PATH + 64, L"%ls\\%ls", dossier, JOURNAL);
  if (GetFileAttributesW(python) == INVALID_FILE_ATTRIBUTES || GetFileAttributesW(script) == INVALID_FILE_ATTRIBUTES) {
    erreur(L"Des fichiers de Soundcrossing manquent.\n\nNe lancez pas le programme depuis le ZIP : "
           L"faites clic droit sur le ZIP, « Extraire tout », puis ouvrez Soundcrossing.exe dans le dossier extrait. "
           L"Gardez tout le dossier ensemble, y compris le sous-dossier runtime.");
    return 1;
  }

  /* Les messages du serveur vont dans le journal au lieu d'une fenêtre noire. */
  SECURITY_ATTRIBUTES heritable = {sizeof(heritable), NULL, TRUE};
  HANDLE sortie = CreateFileW(journal, GENERIC_WRITE, FILE_SHARE_READ | FILE_SHARE_WRITE, &heritable, CREATE_ALWAYS,
                              FILE_ATTRIBUTE_NORMAL, NULL);
  HANDLE entree = CreateFileW(L"NUL", GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE, &heritable, OPEN_EXISTING, 0, NULL);
  STARTUPINFOW demarrage = {0};
  demarrage.cb = sizeof(demarrage);
  if (sortie != INVALID_HANDLE_VALUE) {
    demarrage.dwFlags = STARTF_USESTDHANDLES;
    demarrage.hStdInput = entree;
    demarrage.hStdOutput = sortie;
    demarrage.hStdError = sortie;
  }
  /* -X utf8 : journal lisible avec les accents ; --lanceur : server.py sait qu'il n'a pas de fenêtre. */
  swprintf(commande, 3 * MAX_PATH, L"\"%ls\" -I -X utf8 \"%ls\" --lanceur", python, script);

  /* Si ce lanceur est fermé de force (Gestionnaire des tâches), le serveur s'arrête avec lui. */
  HANDLE groupe = CreateJobObjectW(NULL, NULL);
  if (groupe) {
    JOBOBJECT_EXTENDED_LIMIT_INFORMATION limite = {0};
    limite.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
    SetInformationJobObject(groupe, JobObjectExtendedLimitInformation, &limite, sizeof(limite));
  }
  if (!CreateProcessW(python, commande, NULL, NULL, TRUE, CREATE_NO_WINDOW, NULL, dossier, &demarrage, &serveur)) {
    erreur(L"Soundcrossing n'a pas pu démarrer : le Python inclus dans le dossier runtime ne se lance pas.\n\n"
           L"Vérifiez que le dossier est entièrement décompressé, ou qu'un antivirus ne l'a pas bloqué.");
    return 1;
  }
  if (groupe) AssignProcessToJobObject(groupe, serveur.hProcess);
  if (sortie != INVALID_HANDLE_VALUE) CloseHandle(sortie);
  if (entree != INVALID_HANDLE_VALUE) CloseHandle(entree);

  WNDCLASSW classe = {0};
  classe.lpfnWndProc = procedure;
  classe.hInstance = instance;
  classe.lpszClassName = L"SoundcrossingLanceur";
  RegisterClassW(&classe);
  fenetre = CreateWindowW(classe.lpszClassName, L"Soundcrossing", 0, 0, 0, 0, 0, NULL, NULL, instance, NULL);
  barre_recreee = RegisterWindowMessageW(L"TaskbarCreated");

  icone.cbSize = sizeof(icone);
  icone.hWnd = fenetre;
  icone.uID = 1;
  icone.uCallbackMessage = WM_ICONE;
  icone.hIcon = (HICON)LoadImageW(instance, MAKEINTRESOURCEW(1), IMAGE_ICON, GetSystemMetrics(SM_CXSMICON),
                                  GetSystemMetrics(SM_CYSMICON), 0);
  wcscpy(icone.szTip, L"Soundcrossing est ouvert. Clic : ouvrir. Clic droit : quitter.");
  wcscpy(icone.szInfoTitle, L"Soundcrossing est lancé");
  wcscpy(icone.szInfo, L"L'application s'ouvre dans le navigateur. Pour l'arrêter : clic droit sur cette icône, puis Quitter.");
  icone.dwInfoFlags = NIIF_USER;
  ajouter_icone(TRUE);

  CreateThread(NULL, 0, surveiller_serveur, NULL, 0, NULL);

  MSG message;
  while (GetMessageW(&message, NULL, 0, 0) > 0) {
    TranslateMessage(&message);
    DispatchMessageW(&message);
  }
  return 0;
}
