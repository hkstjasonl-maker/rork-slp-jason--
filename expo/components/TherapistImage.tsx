import React from 'react';
import { Image, ImageStyle, StyleProp } from 'react-native';
import { useApp } from '@/contexts/AppContext';
import { JASON_PHOTO, JASON_CARTOON } from '@/constants/images';

interface TherapistImageProps {
  type: 'photo' | 'cartoon';
  style: StyleProp<ImageStyle>;
}

function TherapistImageInner({ type, style }: TherapistImageProps) {
  const { therapistPhotoUrl, therapistCartoonUrl } = useApp();

  const remoteUrl = type === 'photo' ? therapistPhotoUrl : therapistCartoonUrl;
  const defaultSource = type === 'photo' ? JASON_PHOTO : JASON_CARTOON;

  if (remoteUrl) {
    return <Image source={{ uri: remoteUrl }} style={style} />;
  }

  return <Image source={defaultSource} style={style} />;
}

export const TherapistImage = React.memo(TherapistImageInner);
