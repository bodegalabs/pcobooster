# The app's own native preview code: PDFKit's viewer with Find for saved PDFs, and the download
# that saves a signed link's file without the app's cookies, cache, or credentials.
Pod::Spec.new do |s|
  s.name           = 'PcobPreview'
  s.version        = '1.0.0'
  s.summary        = 'Song file previews for pcobooster.com'
  s.description    = 'PDFKit viewer with Find, and credential-free preview downloads.'
  s.license        = 'UNLICENSED'
  s.author         = 'pcobooster.com'
  s.homepage       = 'https://pcobooster.com'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '6.0'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.frameworks = 'PDFKit'
  s.source_files = '**/*.swift'
end
