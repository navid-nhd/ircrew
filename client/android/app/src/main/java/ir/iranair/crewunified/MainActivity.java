package ir.iranair.crewunified;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Register the custom HTTP plugin before super.onCreate so the JS side
        // can resolve `IRCrewHttp` from the very first call.
        registerPlugin(IRCrewHttpPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
