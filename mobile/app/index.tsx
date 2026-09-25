import { Text, View } from 'react-native';
import { words } from '../src/core/words';
export default function Home(){return <View style={{flex:1,justifyContent:'center',alignItems:'center'}}><Text>Ownvoice</Text><Text>{words.home}</Text></View>;}
