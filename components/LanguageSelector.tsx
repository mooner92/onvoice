import React from 'react'
import { Button } from './ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'

interface Language {
  code: string
  name: string
  nativeName: string
}

const LANGUAGES: Language[] = [
  { code: 'en-US', name: 'English', nativeName: 'English' },
  { code: 'ko-KR', name: 'Korean', nativeName: '한국어' },
  { code: 'ja-JP', name: 'Japanese', nativeName: '日本語' },
  { code: 'zh-CN', name: 'Chinese (Simplified)', nativeName: '中文 (简体)' },
  { code: 'zh-TW', name: 'Chinese (Traditional)', nativeName: '中文 (繁體)' },
  { code: 'es-ES', name: 'Spanish', nativeName: 'Español' },
  { code: 'fr-FR', name: 'French', nativeName: 'Français' },
  { code: 'de-DE', name: 'German', nativeName: 'Deutsch' },
  { code: 'it-IT', name: 'Italian', nativeName: 'Italiano' },
  { code: 'pt-BR', name: 'Portuguese (Brazil)', nativeName: 'Português (Brasil)' },
  { code: 'ru-RU', name: 'Russian', nativeName: 'Русский' },
  { code: 'ar-SA', name: 'Arabic', nativeName: 'العربية' },
  { code: 'hi-IN', name: 'Hindi', nativeName: 'हिन्दी' },
  { code: 'th-TH', name: 'Thai', nativeName: 'ไทย' },
  { code: 'vi-VN', name: 'Vietnamese', nativeName: 'Tiếng Việt' },
]

interface LanguageSelectorProps {
  primaryLanguage: string
  secondaryLanguage: string
  onPrimaryLanguageChange: (language: string) => void
  onSecondaryLanguageChange: (language: string) => void
  onStart: () => void
  isStarted: boolean
}

export default function LanguageSelector({
  primaryLanguage,
  secondaryLanguage,
  onPrimaryLanguageChange,
  onSecondaryLanguageChange,
  onStart,
  isStarted
}: LanguageSelectorProps) {
  const getLanguageDisplay = (code: string) => {
    const lang = LANGUAGES.find(l => l.code === code)
    return lang ? `${lang.name} (${lang.nativeName})` : code
  }

  const getWebSpeechLanguages = () => {
    if (primaryLanguage && secondaryLanguage && secondaryLanguage !== 'none') {
      return `${primaryLanguage},${secondaryLanguage}`
    }
    return primaryLanguage || 'en-US'
  }

  return (
    <Card className="w-full max-w-md mx-auto mb-6">
      <CardHeader>
        <CardTitle className="text-center">🎤 Presentation Language Setup</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Primary Language */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Main Presentation Language</label>
          <Select value={primaryLanguage} onValueChange={onPrimaryLanguageChange}>
            <SelectTrigger>
              <SelectValue placeholder="Select primary language" />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGES.map((language) => (
                <SelectItem key={language.code} value={language.code}>
                  {getLanguageDisplay(language.code)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Secondary Language */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Emphasis Language (for Special Points)</label>
          <Select value={secondaryLanguage} onValueChange={onSecondaryLanguageChange}>
            <SelectTrigger>
              <SelectValue placeholder="Select emphasis language (optional)" />
            </SelectTrigger>
            <SelectContent>
                              <SelectItem value="none">None (English Only)</SelectItem>
              {LANGUAGES.filter(lang => lang.code !== primaryLanguage).map((language) => (
                <SelectItem key={language.code} value={language.code}>
                  {getLanguageDisplay(language.code)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Language Display */}
        <div className="p-3 bg-gray-50 rounded-lg">
          <div className="text-sm text-gray-600">
            <div><strong>Main:</strong> {primaryLanguage ? getLanguageDisplay(primaryLanguage) : 'Not selected'}</div>
            <div><strong>Emphasis:</strong> {secondaryLanguage && secondaryLanguage !== 'none' ? getLanguageDisplay(secondaryLanguage) : 'None'}</div>
            <div className="mt-2 text-xs text-gray-500">
              <strong>Web Speech API:</strong> {getWebSpeechLanguages()}
            </div>
          </div>
        </div>

        {/* Start Button */}
        <Button 
          onClick={onStart} 
          disabled={!primaryLanguage || isStarted}
          className="w-full"
        >
          {isStarted ? '🟢 Presenting...' : '🎤 Start Presentation'}
        </Button>
      </CardContent>
    </Card>
  )
} 