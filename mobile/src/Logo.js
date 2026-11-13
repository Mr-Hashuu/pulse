import React from "react";
import Svg, { Defs, LinearGradient, Stop, Rect, Path } from "react-native-svg";

export default function Logo({ size = 96 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 96 96">
      <Defs>
        <LinearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#5B6CFF" />
          <Stop offset="1" stopColor="#A66BFF" />
        </LinearGradient>
      </Defs>
      <Rect width="96" height="96" rx="28" fill="url(#g)" />
      <Path d="M22 34a10 10 0 0 1 10-10h32a10 10 0 0 1 10 10v20a10 10 0 0 1-10 10H46L32 76V64h0a10 10 0 0 1-10-10z" fill="#fff" opacity="0.96" />
      <Path d="M30 46h8l4-9 6 17 5-11 3 3h10" fill="none" stroke="#6F63FF" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
