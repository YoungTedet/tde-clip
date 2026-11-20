# TDE Clip – YouTube prosto do DaVinci

Wybierasz momenty filmu, a TDE Clip pobiera je w wybranej jakości i wkłada do **nowego binu w Media
Poolu** (opcjonalnie od razu na timeline). Działa na **macOS i Windows**.

Masz dwie drogi:

| | jak | co robisz |
|---|---|---|
| **Chrome** (też Edge/Brave) | pod filmem na YouTube przycisk **DaVinci** (albo ⌥D / Alt+D) | panel po prawej: zaznaczasz fragmenty w trakcie oglądania, wybierasz opcje, „Pobierz do DaVinci” |
| **DaVinci** | **Workspace › Scripts › TDE Clip** (albo Workspace › Workflow Integrations › TDE Clip) | okno z wyszukiwarką YouTube, podglądem, tymi samymi opcjami i listą pobrań |

## Instalacja (raz)

- **macOS:** dwuklik `Zainstaluj.command`
- **Windows:** dwuklik `Zainstaluj.bat`

Instalator znajduje Pythona, sprawdza yt-dlp i ffmpeg (na Windows proponuje instalację przez winget),
dodaje skrót w DaVinci, rejestruje pomocnika, dzięki któremu Chrome sam uruchamia silnik, i startuje
silnik.

Ostatni krok jest ręczny. Otwórz `chrome://extensions` (albo `edge://extensions`), włącz
**Tryb dewelopera**, kliknij **Wczytaj rozpakowane** i wskaż folder `extension`.

W DaVinci musi być włączone **Preferences › System › General › External scripting using: Local**.

## Zaznaczanie fragmentów

- **Przeciągnij** po pasku klatek → nowy fragment (wideo przewija się razem z kursorem).
- **I** = początek, **O** = koniec, w trakcie oglądania, jak w programie do montażu. **Esc** anuluje
  rozpoczęty fragment.
- Żółte **uchwyty** zmieniają granice, przeciągnięcie środka przesuwa cały fragment.
- Czasy można wpisać ręcznie (`1:23`, `83`, `1m23s`), a **▶** odtwarza sam fragment.
- **Rozdziały** z YouTube dodasz jednym kliknięciem.
- Bez zaznaczenia pobiera się cały film.

## Opcje

- **Zawartość:** obraz i dźwięk / tylko obraz / tylko dźwięk.
- **Jakość:** lista z tego, co naprawdę jest na YouTube (do 4K/60).
- **Format:**
  - *Oryginał (H.264)*: VP9/AV1, które szarpią w DaVinci, są zamieniane na H.264.
  - *ProRes 422 HQ* albo *DNxHR HQ*: płynny montaż, dźwięk PCM 48 kHz.
  - Dla samego dźwięku: WAV 48 kHz, AAC albo MP3.
- **Na timeline:**
  - *Tylko Media Pool*;
  - *Przy playheadzie*: na pierwszej wolnej ścieżce, od miejsca widocznego w panelu w chwili
    kliknięcia, fragmenty jeden za drugim;
  - *Nowa timeline*.
- **Więcej opcji:**
  - *Zapas na cięcia* (handles): dodatkowe sekundy przed i po fragmencie, ukryte w klipie na
    timeline. Możesz je potem rozciągnąć.
  - *Napisy .srt* (PL/EN), przycięte do fragmentu.
  - *Rozdziały jako markery* na klipie.
  - *Źródło w metadanych*: link i kanał w komentarzu klipu, do napisów końcowych.
  - Nazwa binu.

Pliki trafiają do `~/Movies/TDE Clip` (Windows: `Wideo\TDE Clip`), każdy film do swojego podfolderu.
Folder zmienisz w Ustawieniach okna w DaVinci.

## Gdy coś nie działa

- **YouTube odmawia (403, „nie jesteś botem”):** zaktualizuj yt-dlp: `brew upgrade yt-dlp` (Windows:
  `winget upgrade yt-dlp.yt-dlp`). Przy filmach 18+ ustaw w Ustawieniach ciasteczka z przeglądarki.
- **Panel w Chrome pokazuje „TDE Clip nie jest uruchomiony”:** otwórz w DaVinci Workspace › Scripts ›
  TDE Clip albo uruchom ponownie instalator.
- **DaVinci zamknięty:** pliki i tak się pobiorą. Na liście pobrań zostanie przycisk „Importuj do
  DaVinci”.
- **Log silnika:** `data/server.log`.

## Budowa (dla ciekawych)

- `server/clip_server.py` – silnik (Python, bez zależności), `127.0.0.1:8770`.
  - Pobiera przez yt-dlp całość (zwykle 15–30 MB/s) i tnie fragmenty lokalnie z dokładnością do
    klatki. Sam fragment prosto z YouTube (`--download-sections`) jest dławiony do tempa
    odtwarzania, więc używa go tylko przy krótkim wycinku z bardzo długiego filmu.
  - Konwertuje przez ffmpeg (VideoToolbox na Macu).
  - Rozmawia z DaVinci w osobnym procesie, więc zajęty DaVinci nie blokuje silnika.
- `extension/` – rozszerzenie Chrome (MV3).
  - `ui/clip-core.js` i `ui/clip.css` to wspólny interfejs: panel opcji, pasek klatek ze storyboardu
    YouTube, lista pobrań.
- `app/` – okno w DaVinci (te same komponenty).
  - `resolve/com.tde.clip/` to wtyczka Workflow Integration (Electron dołączony do DaVinci).
- `native-host/` – pomocnik, który pozwala Chrome uruchomić silnik.
- `dev/` – stanowisko do zrzutów ekranu (tylko do rozwoju; `TDE_CLIP_DEV=1`).
