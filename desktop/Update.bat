@echo off
:: ============================================================
:: SchoolERP Safe Update — Double-click to update School ERP
:: ============================================================
:: This script safely updates your School ERP application.
:: Your database, uploads and backups will NEVER be deleted.
::
:: Instructions:
::   1. Close School ERP if it is running.
::   2. Double-click this file.
::   3. Follow the on-screen instructions.
:: ============================================================

title SchoolERP Safe Update Tool

PowerShell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Update.ps1"

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Update encountered an error. Please contact your administrator.
    pause
)
