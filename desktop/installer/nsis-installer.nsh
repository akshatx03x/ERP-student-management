!macro customInstall
  CreateDirectory "$PROFILE\AppData\Local\SchoolERP"
  CreateDirectory "C:\ProgramData\SchoolERP"
  CreateDirectory "C:\ProgramData\SchoolERP\uploads"
  CreateDirectory "C:\ProgramData\SchoolERP\backups"
  CreateDirectory "C:\ProgramData\SchoolERP\storage"

  ExecWait 'icacls "C:\ProgramData\SchoolERP" /grant Users:(OI)(CI)F /T'
!macroend
