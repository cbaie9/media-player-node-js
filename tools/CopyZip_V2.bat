@echo off
setlocal enableextensions

:: --- Configuration des chemins ---
:ask_path
echo Entrez le chemin du dossier contenant les fichiers ZIP:
set /p "zip_folder="
set "zip_path=%cd%\%zip_folder%"
if not exist "%zip_path%" (
    cls
    echo [ERREUR] Le dossier "%zip_path%" n'existe pas.
    goto ask_path
)

:ask_destination
echo Entrez le chemin du dossier de destination pour les fichiers extraits:
set /p "dest_folder="
set "dest_path=%cd%\%dest_folder%"
if not exist "%dest_path%" (
    cls
    echo [ERREUR] Le dossier "%dest_path%" n'existe pas.
    goto ask_destination
)

:: --- Boucle principale ---
:process_zips
echo.
echo ---------- Traitement des fichiers ZIP ----------
echo Dossier source: %zip_path%
echo Dossier de destination: %dest_path%
echo.

:: Demande le nom du fichier ZIP à traiter
set /p "zip_file=Nom du fichier ZIP à extraire (ou 'quit' pour quitter): "
if "%zip_file%"=="quit" exit /b

:: Vérifie si le fichier ZIP existe
if not exist "%zip_path%\%zip_file%" (
    echo [ERREUR] Le fichier "%zip_file%" n'existe pas dans "%zip_path%".
    goto process_zips
)

:: Demande le préfixe pour les fichiers renommés
set /p "file_prefix=Préfixe pour les fichiers renommés: "

:: Extrait le ZIP
powershell -command "Expand-Archive -LiteralPath '%zip_path%\%zip_file%' -DestinationPath '%zip_path%\temp_extract'"
if errorlevel 1 (
    echo [ERREUR] Échec de l'extraction de "%zip_file%".
    goto process_zips
)

:: Traite les fichiers extraits
set "processed=0"
set "temp_path=%zip_path%\temp_extract"

for %%f in ("%temp_path%\*.*") do (
    set "ext=%%~xf"
    if /i "!ext!"==".png" set "type=png"
    if /i "!ext!"==".jpg" set "type=jpg"
    if /i "!ext!"==".gif" set "type=gif"

    if defined type (
        set /a "processed+=1"
        set "num=!processed!"
        set "z0=0000"

        :: Gestion des zéros initiaux dynamiques
        if !num! geq 10 set "z0=000"
        if !num! geq 100 set "z0=00"
        if !num! geq 1000 set "z0=0"
        if !num! geq 10000 set "z0="

        ren "%%f" "%file_prefix%-!z0!!num!%%~xf"
        move "%file_prefix%-!z0!!num!%%~xf" "%dest_path%"
    )
)

:: Nettoyage
del /q "%temp_path%\*.*"
rmdir "%temp_path%"
del "%zip_path%\%zip_file%"

echo.
echo [SUCCÈS] %processed% fichiers traités et déplacés vers "%dest_path%".
echo.

goto process_zips