$Action = New-ScheduledTaskAction -Execute "node.exe" -Argument "scripts/fetch_daily_jobs.js" -WorkingDirectory "C:\Users\Syed Enarxi\hinterview"
$Trigger = New-ScheduledTaskTrigger -Daily -At 9:00AM
Register-ScheduledTask -TaskName "DailyJobHunter" -Action $Action -Trigger $Trigger -Description "Daily LinkedIn Job Hunter Scraper" -Force
Write-Host "Windows Scheduled Task 'DailyJobHunter' successfully registered for 9:00 AM IST daily!"

