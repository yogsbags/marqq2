import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

/**
 * API route to fetch available HeyGen avatars
 * Returns the list of configured Indian avatars with their group IDs and voices
 */
export async function GET() {
  try {
    // Read the avatar mapping file - try multiple possible paths
    const possiblePaths = [
      path.join(process.cwd(), '..', 'backend', 'config', 'heygen-native-voice-mapping.json'),
      path.join(process.cwd(), 'backend', 'config', 'heygen-native-voice-mapping.json'),
      path.join(process.cwd(), '..', '..', 'backend', 'config', 'heygen-native-voice-mapping.json'),
      path.join(process.cwd(), '..', '..', 'config', 'heygen-avatar-config.js'),
    ]

    let configPath = possiblePaths.find(p => fs.existsSync(p))
    if (!configPath) {
      throw new Error('Avatar config file not found in any expected location')
    }

    let avatarData
    if (configPath.endsWith('.json')) {
      avatarData = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    } else if (configPath.endsWith('.js')) {
      // Handle JS config file - use require for CommonJS
      delete require.cache[require.resolve(configPath)]
      const config = require(configPath)
      // Convert config format to match JSON format
      avatarData = {}
      if (config.publicIndianAvatars) {
        config.publicIndianAvatars.forEach((avatar: any) => {
          avatarData[avatar.id] = {
            avatarName: avatar.name,
            groupId: avatar.id,
            voiceId: avatar.voiceId,
            voiceName: config.voices?.[avatar.voiceId]?.description || avatar.voiceId,
            gender: avatar.gender,
            description: avatar.description,
            language: 'en-IN'
          }
        })
      }
    } else {
      // Handle JS config file
      delete require.cache[require.resolve(configPath)]
      const config = require(configPath)
      // Convert config format to match JSON format
      avatarData = {}
      config.publicIndianAvatars.forEach((avatar: any) => {
        avatarData[avatar.id] = {
          avatarName: avatar.name,
          groupId: avatar.id,
          voiceId: avatar.voiceId,
          voiceName: config.voices[avatar.voiceId]?.description || avatar.voiceId,
          gender: avatar.gender,
          description: avatar.description,
          language: 'en-IN'
        }
      })
    }

    // Convert to array format for frontend
    const avatars = Object.values(avatarData).map((avatar: any) => ({
      id: avatar.groupId,
      name: avatar.avatarName,
      groupId: avatar.groupId,
      voiceId: avatar.voiceId,
      voiceName: avatar.voiceName,
      gender: avatar.gender,
      description: avatar.description,
      language: avatar.language
    }))

    return NextResponse.json({ avatars }, { status: 200 })
  } catch (error: any) {
    console.error('Error loading avatars:', error)
    return NextResponse.json(
      { error: 'Failed to load avatars', message: error.message },
      { status: 500 }
    )
  }
}

