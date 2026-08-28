import { Alert, ActionSheetIOS, Platform } from 'react-native'
import {
  launchCamera,
  launchImageLibrary,
  type ImageLibraryOptions,
  type CameraOptions,
} from 'react-native-image-picker'
import type { PickedDocument } from '../components/common/DocumentPickerCard'

const LIBRARY_OPTS: ImageLibraryOptions = {
  mediaType: 'photo',
  quality: 0.8,
  selectionLimit: 1,
}

const CAMERA_OPTS: CameraOptions = {
  mediaType: 'photo',
  quality: 0.8,
}

async function launch(useCamera: boolean): Promise<PickedDocument | null> {
  try {
    const result = useCamera
      ? await launchCamera(CAMERA_OPTS)
      : await launchImageLibrary(LIBRARY_OPTS)

    if (result.didCancel || result.errorCode || !result.assets?.[0]) return null

    const asset = result.assets[0]
    return {
      uri: asset.uri!,
      name: asset.fileName ?? `photo_${Date.now()}.jpg`,
      type: asset.type ?? 'image/jpeg',
      size: asset.fileSize,
    }
  } catch {
    return null
  }
}

/**
 * Shows a camera/gallery action sheet and returns a PickedDocument,
 * or null if the user cancels or an error occurs.
 */
export function pickImage(): Promise<PickedDocument | null> {
  return new Promise((resolve) => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cámara', 'Galería de fotos', 'Cancelar'],
          cancelButtonIndex: 2,
        },
        (index) => {
          if (index === 2) return resolve(null)
          launch(index === 0).then(resolve)
        },
      )
    } else {
      Alert.alert('Seleccionar imagen', undefined, [
        { text: 'Cámara', onPress: () => launch(true).then(resolve) },
        { text: 'Galería', onPress: () => launch(false).then(resolve) },
        { text: 'Cancelar', style: 'cancel', onPress: () => resolve(null) },
      ])
    }
  })
}
