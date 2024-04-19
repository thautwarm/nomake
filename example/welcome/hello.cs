using System.Runtime.InteropServices;
public static class Exports
{
    [UnmanagedCallersOnly(EntryPoint = "hello")]
    static void Hello()
    {
        System.Console.WriteLine("Hello from C#!");
    }
}