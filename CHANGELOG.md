# DF Downloader Changelog



## 2.3.0 (2025-03-11)

### Features
- Added file templates in Content Management settings allowing you to specify custom naming based on info from the content.
  - Example: `{{#ifTag 'df direct'}}DF Direct/{{/ifTag}}{{YYYY}}/{{download-filename}}` - this will put all DF Directs into a DF Direct directory, and all content will go into YEAR/FILENAME
  - So `DF RETRO Analogue Pocket Review HEVC.mp4` would go to `2021\DF RETRO Analogue Pocket Review HEVC.mp4.mp4`
  - `DF Direct 199 1080p H264.mp4` would go to `DF Direct\2025\DF Direct 199 1080p H264.mp4a.mp4`
- Added various tools for file maintenance including
  - Reorganize files - a tool to allow you to reorganize your existing downloads based on the current configured template
  - Maintenance tools
    - Clear Missing Files - removes references to files that no longer exist (e.g., if you've downloaded something with the tool but since deleted it)
    - Scan for existing content - Scans directory for existing content and adds it to the DB
    - Clear empty directories - clears empty directories (useful if you've moved files around a lot from templates)
- Added changlog to the UI
  - Changelog is now available in the UI under the system menu
  - Changelog now displays in a dialog when a new version is detected
  - Will attempt to fetch the changelog from github first as this is the most up to date source and will help identify if the user is on the latest version
- Snackbars now display when tasks start and finish, and if the session token expires
### Bug Fixes
- Fixed drag and drop on mobile devices (media formats, subtitles providers)
### Enhancements
- Media format changes
  - Media formats now configured in its own config section
  - Audio encoding and video encoding properties are now parsed and form part of the media type matching
  - Improved media format matching based on the parsed encoding properties. This allows for improved matchers and better handling of different formats with different levels of specificity - This opens the door to the possibility of custom media formats in the future should it be needed, but right now they're hardcoded
  - Added various new media types - "Any" is a catch-all for any media type, "Video" is any video format, "Audio" is any audio format - "4K", "1440p", "1080p", "720p" are now separate media formats which don't care about the encoding - HEVC and h.264 are now catch-alls for any resolution, and HEVC, 4K etc at various resolutions have been added as media formats
  - It is now possible to add and remove items from the media format list in the UI
  - Any media formats NOT in the list are now ignored. This helps prevent automatic downloading of unwanted formats (such as RAR archives of UE5 projects)
- Automatically return to login page if session token expires
### Maintenance
- npm audit fix to address security vulnerabilities
### Internal
- Split the "database" into 3 separate files
  - content-info-db.json for content info (description, published date, tags, media infos etc)
  - content-status-db.json for local status of content (e.g. downloads, availability based on tiers etc)
  - user-db.json for info about the DF user
- changelog is now a .yaml file allowing programmatic access to the data
- Various schema changes
- Media info now includes both format (e.g. h.264) and type (e.g. VIDEO, AUDIO etc)

## 2.2.6 (2025-01-25)

### Bug Fixes
- Fix an issue on first run where container path was set to be relative to the services directory. This would result in downloads never actually being saved to the host machine. The working dir and destination dirs are now forced to /working_dir and /destination_dir when running in a container.

## 2.2.5 (2024-06-24)

### Bug Fixes
- Subtitles
  - Fixed bug where downloads would fail if subtitles could not be found (some content will not have subtitles at all, and regardless of this the download should still succeed)

## 2.2.4 (2024-06-20)

### Features
- YouTube video now embedded on content detail page if available
### Enhancements
- Tag Management
  - Always keep tags in order
- Content Metadata
  - Auto-refresh when opening content item
  - Refresh before download and when download is triggered (useful for delayed auto downloads as this could result in better match for desired format)
- Automatic Downloads
  - Automatic download is now skipped if the content is already downloading or downloaded (for example if you have download delay of 10 minutes but manually trigger the download before, it will now not perform a second unnecessary download)
- Subtitles
  - Use correct eng language code when injecting eng subs
- YouTube
  - Implemented a rudimentary method to detect and handle sponsored videos that contain additional content at the start. Since the downloaded videos from DF do not include this sponsored content, it could cause the subtitles to be significantly out of sync. Current is to offset the subtitles and remove the irrelevant ones if the YouTube video length exceeds our video length by more than 5 seconds (this works entirely on time difference and doesn't do anything fancy like try to understand the subs)
### Bug Fixes
- UI
  - Fixed console errors related to unique keys
  - Added keys to all routes
- Content management
  - Don't error if file no longer exists when trying to delete, instead just treat it as successfully deleted
### Known Issues
- Subtitles
  - Fetching subtitles on a video that already has them does not replace the subs. Currently the only option is to re-download the video.

## 2.2.3 (2024-04-27)

### Features
- Task Management
  - Added status message to subtitle tasks
  - Added pausing and cancelling task states to improve UI button states (e.g., can no longer try to pause/start a pausing task)
- Dependency Management
  - Removed unused dependencies

## 2.2.2 (2024-04-27)

### Features
- Documentation
  - Updated README and Docker run sample
- UI Improvements
  - Fixed archive page scanning after page structure change
  - Set max width on modal

## 2.2.1 (2024-04-20)

### Features
- Task Management
  - Introduced task manager, allowing pause, resume, cancel, force start
### Enhancements
- Download Improvements
  - Re-wrote download code to use fetch and custom FSM to allow better control of running downloads
  - Checks ETags when resuming
- UI Improvements
  - Improved some responsive styling
  - Fixed width on small screens
  - More active task info on cards
  - Improved layout of download status on small screen
  - Introduced UI components for download/post process/complete list
  - Improved icon size and fade
  - Added fun new loading icon
- Code Organization and Efficiency
  - Reorganized some code
  - General state efficiency improvements
  - Reorganized downloads
  - Improved df content redux state structure slightly
- Error Handling and Fixes
  - Added an error page when can't connect to backend
- Development and Build Improvements
  - Switched from create-react-app to vite
  - Switched to typescript 5.3.2
  - Updated Dockerfile to reduce layers and remove node_modules after builds (massively reduces image size)
  - Use node 20
- YouTube Subtitles
  - Added Youtube subtitles fetch code
### Bug Fixes
- Fixed bug with pushbullet, no longer notifies if disabled
- Fixed up notifications
### Miscellaneous
- Added dev settings
- Refactored db to account for multiple downloads
- Improved logging
- Removed console.logs

## 2.0.0-2.2.0 (2024-02-20)

### Features
- WebUI
  - There is now a web UI
- Subtitles
  - Added ability to extract subtitles from YouTube and use Google STT
### Enhancements
- Updated download button icons in detail view to reflect current status
- Updated media format matching to use RegEx
- Session Handling
- Improved handling when no session id set, media info rescanning etc
### Bug Fixes
- Downloader
  - Fixed bug where maxConnections not being honoured
- Fixed token config and allowed origins for localhost

## 1.0.0-1.x.x (2023-03-12)

The versioning for releases prior to 2.0 is patchy and may not accurately reflect the changes made in each version.

### Features
- Subtitles
  - Added experimental feature to auto generate subs using Deepgram
- Downloader
  - Added ability to run with multiple simultaneous connections
  - Can now scan full archive, scan for existing downloads, stores more meta, can be queried in REST API etc
  - Support for detecting paywalled content, checking user login status etc
### Bug Fixes
- Fixed description truncation by pulling from article body instead of meta
- Fixed bug where ignorelist wasn't being appended to correctly, resulting in duplicate downloads on restart
- Fixed CSS selectors when getting meta info about videos
