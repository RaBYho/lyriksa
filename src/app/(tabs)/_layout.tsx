import { Tabs } from 'expo-router';
import { CustomTabBar } from '@/components/CustomTabBar';

export default function TabLayout() {
  return (
    <Tabs
      tabBar={props => <CustomTabBar {...props} variant="pill" />}
      screenOptions={{
        headerShown: false,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Fandraisana',
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: 'Hitady',
        }}
      />
      <Tabs.Screen
        name="songbook"
        options={{
          title: 'Tahiry',
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Fikirana',
        }}
      />
    </Tabs>
  );
}
